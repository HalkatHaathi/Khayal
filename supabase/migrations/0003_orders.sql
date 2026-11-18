-- Phase B4: order creation, stock reservation, payment hooks. Safe to re-run. Needs 0001 and 0002 first.
-- Cash on delivery works end to end. Online payment stays OFF (shop_settings.online_payments_enabled = false)
-- until the GoKwik webhook is connected; mark_order_paid / mark_order_failed are the hooks it will call.

alter type public.order_status add value if not exists 'confirmed';   -- COD order accepted, not yet shipped

alter table public.orders        add column if not exists customer_name text;
alter table public.orders        add column if not exists cod_fee       integer not null default 0;
alter table public.orders        add column if not exists expires_at    timestamptz;   -- unpaid online orders hold stock until this time
alter table public.shop_settings add column if not exists online_payments_enabled boolean not null default false;
create index if not exists orders_phone_idx on public.orders (phone, created_at desc);

-- ---------- give stock back for unpaid online orders whose hold has run out ----------
create or replace function public.release_expired_orders() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; o record;
begin
  for o in
    select id from public.orders
    where status = 'pending' and payment_method = 'prepaid' and expires_at is not null and expires_at < now()
    for update skip locked
  loop
    update public.product_sizes ps set stock = ps.stock + i.q
    from (select product_id, size, sum(qty)::integer as q from public.order_items where order_id = o.id and product_id is not null group by 1, 2) i
    where ps.product_id = i.product_id and ps.size = i.size;
    update public.orders set status = 'cancelled' where id = o.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- place an order ----------
-- Everything is re-priced here by quote_cart; the browser's totals are never used.
-- One transaction: any failure rolls back, including the stock it already took.
create or replace function public.create_order(
  p_items jsonb, p_coupon text, p_payment text, p_contact jsonb, p_address jsonb,
  p_gift boolean default false, p_gift_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s       public.shop_settings;
  q       jsonb;
  agg     record;
  ord     public.orders;
  v_phone text := regexp_replace(coalesce(p_contact->>'phone', ''), '\s', '', 'g');
  v_name  text := trim(coalesce(p_contact->>'name', ''));
  v_email text := nullif(trim(coalesce(p_contact->>'email', '')), '');
  recent  integer;
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
                             coupon_code, is_gift, gift_note, shipping_address, payment_method, expires_at)
  values (auth.uid(), v_email, v_phone, v_name,
          (case when p_payment = 'cod' then 'confirmed' else 'pending' end)::public.order_status,
          (q->>'subtotal')::integer, (q->>'discount')::integer, (q->>'shipping')::integer, (q->>'cod_fee')::integer, (q->>'total')::integer,
          case when coalesce((q->'coupon'->>'ok')::boolean, false) then q->'coupon'->>'code' end,
          coalesce(p_gift, false), nullif(trim(coalesce(p_gift_note, '')), ''),
          jsonb_build_object('name', v_name, 'phone', v_phone, 'line1', trim(p_address->>'line1'), 'line2', nullif(trim(coalesce(p_address->>'line2', '')), ''),
                             'city', trim(p_address->>'city'), 'state', trim(p_address->>'state'), 'pincode', p_address->>'pincode'),
          p_payment, case when p_payment = 'prepaid' then now() + interval '30 minutes' end)
  returning * into ord;

  insert into public.order_items (order_id, product_id, name, size, set_name, pants_size, unit_price, qty)
  select ord.id, p.id, l->>'name', l->>'size', nullif(l->>'set', ''), nullif(l->>'pants', ''), (l->>'unit_price')::integer, (l->>'qty')::integer
  from jsonb_array_elements(q->'lines') l join public.products p on p.slug = l->>'slug';

  return jsonb_build_object('id', ord.id, 'number', ord.number, 'status', ord.status, 'total', ord.total, 'payment_method', ord.payment_method);
end $$;

-- ---------- look an order up (guests prove it with the phone number used) ----------
create or replace function public.get_order(p_id uuid, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'payment_method', o.payment_method, 'created_at', o.created_at,
    'subtotal', o.subtotal, 'discount', o.discount, 'shipping', o.shipping, 'cod_fee', o.cod_fee, 'total', o.total,
    'customer_name', o.customer_name, 'address', o.shipping_address,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'set', i.set_name, 'pants', i.pants_size, 'qty', i.qty, 'unit_price', i.unit_price)), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id))
  from public.orders o
  where o.id = p_id and (o.phone = regexp_replace(coalesce(p_phone, ''), '\s', '', 'g') or (auth.uid() is not null and o.user_id = auth.uid()));
$$;

-- ---------- payment hooks: service role only (the GoKwik webhook function will call these) ----------
create or replace function public.mark_order_paid(p_order uuid, p_gateway_ref text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  -- shortcut: a payment that lands after the hold expired (status cancelled) is NOT accepted here; B4+GoKwik must refund or re-reserve it.
  update public.orders set status = 'paid', paid_at = coalesce(paid_at, now()), gateway_ref = p_gateway_ref, expires_at = null
  where id = p_order and status = 'pending';
  return found;
end $$;

create or replace function public.mark_order_failed(p_order uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.product_sizes ps set stock = ps.stock + i.q
  from (select product_id, size, sum(qty)::integer as q from public.order_items
        where order_id = p_order and product_id is not null group by 1, 2) i
  where ps.product_id = i.product_id and ps.size = i.size
    and exists (select 1 from public.orders where id = p_order and status = 'pending');
  update public.orders set status = 'failed', expires_at = null where id = p_order and status = 'pending';
  return found;
end $$;

-- ---------- who may call what ----------
revoke all on function public.release_expired_orders()          from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, text)       from public, anon, authenticated;
revoke all on function public.mark_order_failed(uuid)           from public, anon, authenticated;
grant execute on function public.release_expired_orders()       to service_role;
grant execute on function public.mark_order_paid(uuid, text)    to service_role;
grant execute on function public.mark_order_failed(uuid)        to service_role;

revoke all on function public.create_order(jsonb, text, text, jsonb, jsonb, boolean, text) from public;
revoke all on function public.get_order(uuid, text)                                         from public;
grant execute on function public.create_order(jsonb, text, text, jsonb, jsonb, boolean, text) to anon, authenticated;
grant execute on function public.get_order(uuid, text)                                        to anon, authenticated;
