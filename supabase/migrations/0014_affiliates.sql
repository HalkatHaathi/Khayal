-- Affiliate programme: an admin gives an existing account a code + link; orders that came through it earn commission.
-- Safe to re-run. Needs 0001-0010. Run it in the Supabase SQL Editor.
--
-- Money rules (all decided here, never by the browser):
--   commission = rate % of (subtotal - discount): product value after discounts, no shipping / COD fee. Fixed when the order is placed.
--   pending   -> the order is not yet delivered, or is still inside the return window (shop_settings.return_days)
--   approved  -> delivered and the return window has passed; this is what the admin pays out
--   paid      -> included in a payout the admin recorded
--   reversed  -> cancelled / failed / refunded: earns nothing
-- Customer identity is never exposed to an affiliate: they see order numbers, items and amounts only.

alter table public.shop_settings add column if not exists return_days integer not null default 7 check (return_days between 0 and 90);
alter table public.orders add column if not exists delivered_at timestamptz;

create or replace function public.stamp_delivered() returns trigger
language plpgsql as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  return new;
end $$;
drop trigger if exists orders_stamp_delivered on public.orders;
create trigger orders_stamp_delivered before update of status on public.orders for each row execute function public.stamp_delivered();

-- the Returns policy page says "7 days" in the starter copy: make it follow the setting (admin: write {{return_days}} in any page)
update public.pages set body = replace(body::text, 'within 7 days of delivery', 'within {{return_days}} days of delivery')::jsonb
where slug = 'returns' and body::text like '%within 7 days of delivery%';

-- ---------- tables ----------
create table if not exists public.affiliates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users(id) on delete cascade,   -- one affiliate profile per account
  name           text not null check (length(name) between 1 and 100),
  code           text not null unique check (code ~ '^[A-Z0-9_-]{3,20}$'),
  rate           numeric(5,2) not null check (rate between 0 and 100),              -- commission, % of order value
  buyer_percent  integer not null default 0 check (buyer_percent between 0 and 100),  -- % off for customers who use the code or link
  status         text not null default 'active' check (status in ('active', 'paused')),
  payout_details text check (length(payout_details) <= 200),                          -- UPI id or bank note, entered by the affiliate
  created_at     timestamptz not null default now()
);
create table if not exists public.affiliate_payouts (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id),
  amount       integer not null check (amount > 0),
  reference    text check (length(reference) <= 100),   -- UPI / bank transaction id
  note         text check (length(note) <= 300),
  paid_at      timestamptz not null default now()
);
create table if not exists public.affiliate_clicks (
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  day          date not null,
  n            integer not null default 0,
  primary key (affiliate_id, day)
);

alter table public.orders add column if not exists affiliate_id         uuid references public.affiliates(id);
alter table public.orders add column if not exists affiliate_commission integer not null default 0 check (affiliate_commission >= 0);
alter table public.orders add column if not exists payout_id            uuid references public.affiliate_payouts(id);
create index if not exists orders_affiliate_idx on public.orders (affiliate_id) where affiliate_id is not null;

alter table public.affiliates        enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.affiliate_clicks  enable row level security;
drop policy if exists "admin all" on public.affiliates;
drop policy if exists "own read"  on public.affiliates;
create policy "admin all" on public.affiliates for all using (public.is_admin()) with check (public.is_admin());
create policy "own read"  on public.affiliates for select using (user_id = auth.uid());
drop policy if exists "admin read" on public.affiliate_payouts;
drop policy if exists "admin read" on public.affiliate_clicks;
create policy "admin read" on public.affiliate_payouts for select using (public.is_admin());
create policy "admin read" on public.affiliate_clicks  for select using (public.is_admin());
-- payouts and clicks are written only by the functions below

-- ---------- status of one affiliate order ----------
create or replace function public.affiliate_order_status(o public.orders, p_days integer) returns text
language sql stable as $$
  select case
    when o.payout_id is not null then 'paid'
    when o.status in ('cancelled', 'failed') or o.refunded_at is not null then 'reversed'
    when o.status = 'delivered' and o.delivered_at is not null and o.delivered_at + make_interval(days => p_days) <= now() then 'approved'
    else 'pending' end
$$;
-- orders worth showing: not awaiting payment, not an unpaid online order that was released
create or replace function public.affiliate_counted(o public.orders) returns boolean
language sql immutable as $$
  select o.status not in ('pending', 'failed') and not (o.status = 'cancelled' and o.payment_method = 'prepaid' and o.paid_at is null)
$$;
revoke all on function public.affiliate_order_status(public.orders, integer) from public;
revoke all on function public.affiliate_counted(public.orders) from public;

-- ---------- public: what the storefront needs when someone arrives through a link ----------
create or replace function public.affiliate_lookup(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', a.code, 'percent', case when a.user_id is not distinct from auth.uid() then 0 else a.buyer_percent end)  -- an affiliate previewing their own link gets no discount
  from public.affiliates a where a.code = upper(trim(coalesce(p_code, ''))) and a.status = 'active';
$$;
create or replace function public.track_affiliate_click(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select id into a from public.affiliates where code = upper(trim(coalesce(p_code, ''))) and status = 'active';
  if a is null then return false; end if;
  insert into public.affiliate_clicks (affiliate_id, day, n) values (a, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (affiliate_id, day) do update set n = public.affiliate_clicks.n + 1;
  return true;
end $$;
revoke all on function public.affiliate_lookup(text), public.track_affiliate_click(text) from public;
grant execute on function public.affiliate_lookup(text), public.track_affiliate_click(text) to anon, authenticated;

-- ---------- the report: the signed-in affiliate sees their own; an admin may pass any affiliate id ----------
create or replace function public.affiliate_report(p_affiliate uuid default null, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a public.affiliates; rd integer; m0 date; m1 date; is_adm boolean := public.is_admin();
  bal jsonb; mon jsonb; rows_ jsonb; top_ jsonb; days_ jsonb; pays jsonb;
begin
  if p_affiliate is null then select * into a from public.affiliates where user_id = auth.uid();
  else
    if not is_adm then raise exception 'not_admin'; end if;
    select * into a from public.affiliates where id = p_affiliate;
  end if;
  if a.id is null then return null; end if;
  select return_days into rd from public.shop_settings limit 1;
  m0 := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Kolkata')::date))::date;
  m1 := (m0 + interval '1 month')::date;

  -- all-time balance by status
  select jsonb_build_object(
    'pending',  coalesce(sum(c) filter (where st = 'pending'), 0),
    'approved', coalesce(sum(c) filter (where st = 'approved'), 0),
    'paid',     coalesce(sum(c) filter (where st = 'paid'), 0))
  into bal
  from (select public.affiliate_order_status(o, rd) st, o.affiliate_commission c from public.orders o where o.affiliate_id = a.id and public.affiliate_counted(o)) x;

  -- this month (orders placed in the month, by Indian date)
  select jsonb_build_object(
    'orders',     count(*) filter (where st <> 'reversed'),
    'revenue',    coalesce(sum(base) filter (where st <> 'reversed'), 0),
    'commission', coalesce(sum(c) filter (where st <> 'reversed'), 0))
  into mon
  from (select public.affiliate_order_status(o, rd) st, o.subtotal - o.discount base, o.affiliate_commission c
        from public.orders o where o.affiliate_id = a.id and public.affiliate_counted(o)
          and (o.created_at at time zone 'Asia/Kolkata')::date >= m0 and (o.created_at at time zone 'Asia/Kolkata')::date < m1) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', case when is_adm then o.id end, 'number', o.number, 'at', o.created_at,
      'base', o.subtotal - o.discount, 'commission', o.affiliate_commission, 'status', public.affiliate_order_status(o, rd),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty)), '[]'::jsonb) from public.order_items i where i.order_id = o.id)
    ) order by o.created_at desc), '[]'::jsonb)
  into rows_
  from (select o2.id from public.orders o2 where o2.affiliate_id = a.id and public.affiliate_counted(o2)
          and (o2.created_at at time zone 'Asia/Kolkata')::date >= m0 and (o2.created_at at time zone 'Asia/Kolkata')::date < m1
        order by o2.created_at desc limit 300) l join public.orders o on o.id = l.id;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', q) order by q desc), '[]'::jsonb) into top_
  from (select i.name, sum(i.qty)::integer q
        from public.orders o join public.order_items i on i.order_id = o.id
        where o.affiliate_id = a.id and public.affiliate_counted(o) and public.affiliate_order_status(o, rd) <> 'reversed'
          and (o.created_at at time zone 'Asia/Kolkata')::date >= m0 and (o.created_at at time zone 'Asia/Kolkata')::date < m1
        group by i.name order by q desc limit 5) t;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date,
      'clicks', coalesce((select n from public.affiliate_clicks c where c.affiliate_id = a.id and c.day = d::date), 0),
      'orders', (select count(*) from public.orders o where o.affiliate_id = a.id and public.affiliate_counted(o) and public.affiliate_order_status(o, rd) <> 'reversed'
                  and (o.created_at at time zone 'Asia/Kolkata')::date = d::date)
    ) order by d), '[]'::jsonb)
  into days_ from generate_series(m0, m1 - 1, interval '1 day') d;

  select coalesce(jsonb_agg(jsonb_build_object('amount', p.amount, 'reference', p.reference, 'note', p.note, 'at', p.paid_at) order by p.paid_at desc), '[]'::jsonb)
  into pays from (select * from public.affiliate_payouts where affiliate_id = a.id order by paid_at desc limit 50) p;

  return jsonb_build_object(
    'affiliate', jsonb_build_object('id', a.id, 'name', a.name, 'code', a.code, 'rate', a.rate, 'buyer_percent', a.buyer_percent, 'status', a.status, 'payout_details', a.payout_details),
    'return_days', rd, 'month', m0,
    'clicks', coalesce((select sum(n) from public.affiliate_clicks c where c.affiliate_id = a.id and c.day >= m0 and c.day < m1), 0),
    'orders', mon->'orders', 'revenue', mon->'revenue', 'commission', mon->'commission',
    'balance', bal, 'rows', rows_, 'top', top_, 'days', days_, 'payouts', pays);
end $$;
revoke all on function public.affiliate_report(uuid, date) from public;
grant execute on function public.affiliate_report(uuid, date) to authenticated;

create or replace function public.set_my_payout_details(p_details text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_details, '')) > 200 then raise exception 'too_long'; end if;
  update public.affiliates set payout_details = nullif(trim(p_details), '') where user_id = auth.uid();
  return found;
end $$;
revoke all on function public.set_my_payout_details(text) from public;
grant execute on function public.set_my_payout_details(text) to authenticated;

-- ---------- admin ----------
create or replace function public.admin_affiliates() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rd integer;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select return_days into rd from public.shop_settings limit 1;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'email', u.email, 'code', a.code, 'rate', a.rate, 'buyer_percent', a.buyer_percent, 'status', a.status,
      'clicks', coalesce((select sum(n) from public.affiliate_clicks c where c.affiliate_id = a.id), 0),
      'orders', t.orders, 'revenue', t.revenue, 'pending', t.pending, 'approved', t.approved, 'paid', t.paid) order by a.created_at desc)
    from public.affiliates a join auth.users u on u.id = a.user_id
    cross join lateral (
      select count(*) filter (where st <> 'reversed') orders,
             coalesce(sum(base) filter (where st <> 'reversed'), 0) revenue,
             coalesce(sum(c) filter (where st = 'pending'), 0) pending,
             coalesce(sum(c) filter (where st = 'approved'), 0) approved,
             coalesce(sum(c) filter (where st = 'paid'), 0) paid
      from (select public.affiliate_order_status(o, rd) st, o.subtotal - o.discount base, o.affiliate_commission c
            from public.orders o where o.affiliate_id = a.id and public.affiliate_counted(o)) x) t
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_create_affiliate(p_email text, p_code text, p_rate numeric, p_buyer_percent integer, p_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid; em text; v_code text := upper(trim(coalesce(p_code, ''))); nm text; new_id uuid;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select id, email into uid, em from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if uid is null then raise exception 'no_account'; end if;
  if v_code !~ '^[A-Z0-9_-]{3,20}$' then raise exception 'invalid_code'; end if;
  if exists (select 1 from public.coupons where code = v_code) or exists (select 1 from public.affiliates where code = v_code) then raise exception 'code_taken'; end if;
  if exists (select 1 from public.affiliates where user_id = uid) then raise exception 'already_affiliate'; end if;
  if p_rate is null or p_rate < 0 or p_rate > 100 or p_buyer_percent is null or p_buyer_percent < 0 or p_buyer_percent > 100 then raise exception 'invalid_rate'; end if;
  nm := coalesce(nullif(trim(p_name), ''), nullif((select full_name from public.profiles where id = uid), ''), split_part(em, '@', 1));
  insert into public.affiliates (user_id, name, code, rate, buyer_percent) values (uid, left(nm, 100), v_code, p_rate, p_buyer_percent) returning id into new_id;
  return new_id;
end $$;

-- pays everything that is approved and not yet paid; the admin has already sent the money, this records it
create or replace function public.admin_pay_affiliate(p_affiliate uuid, p_reference text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rd integer; amt integer; ids uuid[]; pid uuid;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  perform 1 from public.affiliates where id = p_affiliate for update;
  if not found then raise exception 'not_found'; end if;
  select return_days into rd from public.shop_settings limit 1;
  select coalesce(sum(c), 0), array_agg(id) into amt, ids from (
    select o.id, o.affiliate_commission c from public.orders o
    where o.affiliate_id = p_affiliate and public.affiliate_counted(o) and public.affiliate_order_status(o, rd) = 'approved' for update of o) d;
  if amt <= 0 then raise exception 'nothing_due'; end if;
  insert into public.affiliate_payouts (affiliate_id, amount, reference, note) values (p_affiliate, amt, left(nullif(trim(p_reference), ''), 100), left(nullif(trim(p_note), ''), 300)) returning id into pid;
  update public.orders set payout_id = pid where id = any(ids);
  return jsonb_build_object('amount', amt, 'orders', cardinality(ids));
end $$;
revoke all on function public.admin_affiliates(), public.admin_create_affiliate(text, text, numeric, integer, text), public.admin_pay_affiliate(uuid, text, text) from public;
grant execute on function public.admin_affiliates(), public.admin_create_affiliate(text, text, numeric, integer, text), public.admin_pay_affiliate(uuid, text, text) to authenticated;

-- ---------- pricing: an affiliate's code works in the coupon box ----------
-- Same as before, except a code that is not a coupon is looked up as an affiliate code (buyer_percent off, never for the affiliate's own account).
create or replace function public.quote_cart(p_items jsonb, p_coupon text default null, p_payment text default 'prepaid')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s          public.shop_settings;
  c          public.coupons;
  af         public.affiliates;
  prod       public.products;
  it         jsonb;
  items      jsonb := coalesce(p_items, '[]'::jsonb);
  lines      jsonb := '[]'::jsonb;
  issues     jsonb := '[]'::jsonb;
  coupon_out jsonb := null;
  v_code     text;
  qty        integer;
  stk        integer;
  unit       integer;
  sub        integer := 0;
  disc       integer := 0;
  ship       integer := 0;
  cod        integer := 0;
begin
  select * into s from public.shop_settings limit 1;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 50 then
    raise exception 'invalid cart';
  end if;

  for it in select value from jsonb_array_elements(items) loop
    qty := greatest(1, least(coalesce((it->>'qty')::integer, 1), s.max_qty_per_line));

    select * into prod from public.products where slug = it->>'slug' and is_active;
    if not found then
      issues := issues || jsonb_build_object('slug', it->>'slug', 'size', it->>'size', 'code', 'unavailable');
      continue;
    end if;

    select stock into stk from public.product_sizes where product_id = prod.id and size = it->>'size';
    stk := coalesce(stk, 0);

    unit := prod.price;
    if prod.type = 'Kurtas' and it->>'set' = 'With Pants' then
      unit := unit + coalesce(prod.pants_addon, 0);
    end if;

    if stk < qty then
      issues := issues || jsonb_build_object(
        'slug', prod.slug, 'size', it->>'size',
        'code', case when stk = 0 then 'sold_out' else 'low_stock' end, 'available', stk);
    end if;

    lines := lines || jsonb_build_object(
      'slug', prod.slug, 'name', prod.name, 'size', it->>'size', 'set', it->>'set', 'pants', it->>'pants',
      'qty', qty, 'unit_price', unit, 'line_total', unit * qty, 'available', stk);
    sub := sub + unit * qty;
  end loop;

  if p_coupon is not null and length(trim(p_coupon)) > 0 then
    v_code := upper(trim(p_coupon));
    select * into c from public.coupons where coupons.code = v_code;
    if found then
      if not c.active or (c.expires_at is not null and c.expires_at < now()) then
        coupon_out := jsonb_build_object('code', v_code, 'ok', false, 'message', 'This code is not valid.');
      elsif sub < c.min_subtotal then
        coupon_out := jsonb_build_object('code', v_code, 'ok', false, 'message', 'Spend Rs. ' || c.min_subtotal || ' or more to use this code.');
      elsif c.first_order_only and auth.uid() is not null and exists (
        select 1 from public.orders o where o.user_id = auth.uid() and o.status in ('paid','shipped','delivered')
      ) then
        coupon_out := jsonb_build_object('code', v_code, 'ok', false, 'message', 'This code is for first orders only.');
      else
        disc := (sub * c.percent) / 100;  -- integer division rounds down, in the customer's favour
        coupon_out := jsonb_build_object(
          'code', v_code, 'ok', true, 'percent', c.percent, 'message', v_code || ' applied',
          -- guests cannot be checked here; B4 re-checks by phone/email when the order is created
          'recheck', c.first_order_only and auth.uid() is null);
      end if;
    else
      select * into af from public.affiliates a
      where a.code = v_code and a.status = 'active' and a.buyer_percent > 0 and a.user_id is distinct from auth.uid();
      if found then
        disc := (sub * af.buyer_percent) / 100;
        coupon_out := jsonb_build_object('code', v_code, 'ok', true, 'percent', af.buyer_percent, 'message', v_code || ' applied', 'recheck', false, 'affiliate', true);
      else
        coupon_out := jsonb_build_object('code', v_code, 'ok', false, 'message', 'This code is not valid.');
      end if;
    end if;
  end if;

  if sub > 0 and sub < s.free_shipping_min then ship := s.shipping_fee; end if;

  if p_payment = 'cod' then
    if s.cod_enabled then
      cod := s.cod_fee;
    else
      issues := issues || jsonb_build_object('code', 'cod_unavailable');
    end if;
  elsif p_payment is not null and p_payment <> 'prepaid' then
    raise exception 'invalid payment method';
  end if;

  return jsonb_build_object(
    'lines', lines, 'issues', issues, 'subtotal', sub, 'discount', disc, 'shipping', ship, 'cod_fee', cod,
    'total', sub - disc + ship + cod, 'coupon', coupon_out,
    'cod', jsonb_build_object('enabled', s.cod_enabled, 'fee', s.cod_fee),
    'free_shipping_min', s.free_shipping_min);
end $$;
revoke all on function public.quote_cart(jsonb, text, text) from public;
grant execute on function public.quote_cart(jsonb, text, text) to anon, authenticated;

-- ---------- placing an order: records who gets credit ----------
-- Credit goes to the affiliate whose CODE was applied, otherwise to whoever's LINK brought the visitor (p_ref, last click, 30 days: the browser enforces that).
-- Self-referral earns nothing: the buyer is the affiliate's account, or uses the affiliate's email.
drop function if exists public.create_order(jsonb, text, text, jsonb, jsonb, boolean, text);
create or replace function public.create_order(
  p_items jsonb, p_coupon text, p_payment text, p_contact jsonb, p_address jsonb,
  p_gift boolean default false, p_gift_note text default null, p_ref text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s       public.shop_settings;
  q       jsonb;
  agg     record;
  ord     public.orders;
  af      public.affiliates;
  v_phone text := regexp_replace(coalesce(p_contact->>'phone', ''), '\s', '', 'g');
  v_name  text := trim(coalesce(p_contact->>'name', ''));
  v_email text := nullif(trim(coalesce(p_contact->>'email', '')), '');
  recent  integer;
  v_aff   uuid;
  v_comm  integer := 0;
  by_code boolean;
begin
  perform public.release_expired_orders();
  select * into s from public.shop_settings limit 1;

  if v_name = '' or length(v_name) > 100 then raise exception 'invalid_contact'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'invalid_phone'; end if;
  if v_email is not null and (v_email !~ '^\S+@\S+\.\S+$' or length(v_email) > 254) then raise exception 'invalid_email'; end if;
  if coalesce(trim(p_address->>'line1'), '') = '' or coalesce(trim(p_address->>'city'), '') = ''
     or coalesce(trim(p_address->>'state'), '') = '' or coalesce(p_address->>'pincode', '') !~ '^[1-9][0-9]{5}$' then
    raise exception 'invalid_address';
  end if;
  if p_payment is null or p_payment not in ('prepaid', 'cod') then raise exception 'invalid_payment'; end if;
  if p_payment = 'prepaid' and not s.online_payments_enabled then raise exception 'online_payments_unavailable'; end if;
  if length(coalesce(p_gift_note, '')) > 200 then raise exception 'invalid_gift_note'; end if;

  -- crude abuse guard until phone verification exists: 3 orders per number per day
  select count(*) into recent from public.orders where phone = v_phone and created_at > now() - interval '24 hours';
  if recent >= 3 then raise exception 'too_many_orders'; end if;

  q := public.quote_cart(p_items, p_coupon, p_payment);
  if jsonb_array_length(q->'lines') = 0 or jsonb_array_length(q->'issues') > 0 then raise exception 'cart_issues'; end if;

  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    if not coalesce((q->'coupon'->>'ok')::boolean, false) then raise exception 'coupon_invalid'; end if;
    -- first-order codes for guests: the phone must have no earlier live order
    if coalesce((q->'coupon'->>'recheck')::boolean, false) and exists (
      select 1 from public.orders where phone = v_phone and status in ('pending', 'confirmed', 'paid', 'shipped', 'delivered')
    ) then raise exception 'coupon_not_eligible'; end if;
  end if;

  by_code := coalesce((q->'coupon'->>'affiliate')::boolean, false) and coalesce((q->'coupon'->>'ok')::boolean, false);
  select * into af from public.affiliates
  where status = 'active' and code = case when by_code then q->'coupon'->>'code' else nullif(upper(trim(coalesce(p_ref, ''))), '') end;
  if af.id is not null then
    if af.user_id = auth.uid() or (v_email is not null and exists (select 1 from auth.users u where u.id = af.user_id and lower(u.email) = lower(v_email))) then
      if by_code then raise exception 'coupon_not_eligible'; end if;   -- cannot use your own code
    else
      v_aff := af.id;
      v_comm := floor(((q->>'subtotal')::integer - (q->>'discount')::integer) * af.rate / 100)::integer;
    end if;
  end if;

  -- reserve stock atomically: the conditional UPDATE locks each row and cannot go below zero
  for agg in
    select p.id as product_id, l->>'size' as size, sum((l->>'qty')::integer)::integer as qty
    from jsonb_array_elements(q->'lines') l join public.products p on p.slug = l->>'slug'
    group by p.id, l->>'size' order by p.id, l->>'size'
  loop
    update public.product_sizes set stock = stock - agg.qty
    where product_id = agg.product_id and size = agg.size and stock >= agg.qty;
    if not found then raise exception 'cart_issues'; end if;
  end loop;

  insert into public.orders (user_id, email, phone, customer_name, status, subtotal, discount, shipping, cod_fee, total,
                             coupon_code, is_gift, gift_note, shipping_address, payment_method, expires_at, affiliate_id, affiliate_commission)
  values (auth.uid(), v_email, v_phone, v_name,
          (case when p_payment = 'cod' then 'confirmed' else 'pending' end)::public.order_status,
          (q->>'subtotal')::integer, (q->>'discount')::integer, (q->>'shipping')::integer, (q->>'cod_fee')::integer, (q->>'total')::integer,
          case when coalesce((q->'coupon'->>'ok')::boolean, false) and not by_code then q->'coupon'->>'code' end,   -- coupon_code is a foreign key to coupons
          coalesce(p_gift, false), nullif(trim(coalesce(p_gift_note, '')), ''),
          jsonb_build_object('name', v_name, 'phone', v_phone, 'line1', trim(p_address->>'line1'), 'line2', nullif(trim(coalesce(p_address->>'line2', '')), ''),
                             'city', trim(p_address->>'city'), 'state', trim(p_address->>'state'), 'pincode', p_address->>'pincode'),
          p_payment, case when p_payment = 'prepaid' then now() + interval '30 minutes' end, v_aff, v_comm)
  returning * into ord;

  insert into public.order_items (order_id, product_id, name, size, set_name, pants_size, unit_price, qty)
  select ord.id, p.id, l->>'name', l->>'size', nullif(l->>'set', ''), nullif(l->>'pants', ''), (l->>'unit_price')::integer, (l->>'qty')::integer
  from jsonb_array_elements(q->'lines') l join public.products p on p.slug = l->>'slug';

  return jsonb_build_object('id', ord.id, 'number', ord.number, 'status', ord.status, 'total', ord.total, 'payment_method', ord.payment_method);
end $$;
revoke all on function public.create_order(jsonb, text, text, jsonb, jsonb, boolean, text, text) from public;
grant execute on function public.create_order(jsonb, text, text, jsonb, jsonb, boolean, text, text) to anon, authenticated;
