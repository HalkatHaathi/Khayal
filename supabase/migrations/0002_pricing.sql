-- Phase B3: server-side pricing, shop settings, per-user carts. Safe to re-run.

-- ---------- settings (edit these rows in the dashboard; no deploy needed) ----------
create table if not exists public.shop_settings (
  id                boolean primary key default true check (id),  -- exactly one row
  free_shipping_min integer not null default 15000,
  shipping_fee      integer not null default 150,                 -- PLACEHOLDER: confirm the real fee
  max_qty_per_line  integer not null default 10,
  cod_enabled       boolean not null default true,
  cod_fee           integer not null default 150                  -- cash on delivery surcharge, Rs.
);
-- if shop_settings already existed from an earlier run of this file:
alter table public.shop_settings add column if not exists cod_enabled boolean not null default true;
alter table public.shop_settings add column if not exists cod_fee integer not null default 150;

-- how an order is paid; set by Phase B4 when the order is created
alter table public.orders add column if not exists payment_method text not null default 'prepaid' check (payment_method in ('prepaid','cod'));
insert into public.shop_settings default values on conflict do nothing;
alter table public.shop_settings enable row level security;
drop policy if exists "settings read" on public.shop_settings;
create policy "settings read" on public.shop_settings for select using (true);

-- ---------- one saved cart per signed-in user ----------
create table if not exists public.user_carts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  items      jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 50),
  updated_at timestamptz not null default now()
);
alter table public.user_carts enable row level security;
drop policy if exists "own cart" on public.user_carts;
create policy "own cart" on public.user_carts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- authoritative price quote ----------
-- Input:  p_items  [{slug, size, set, pants, qty}]   p_coupon  text or null   p_payment  'prepaid' | 'cod'
-- Output: lines, issues, subtotal, discount, shipping, cod_fee, total, coupon, cod {enabled, fee}, free_shipping_min
-- Prices are GST-inclusive; nothing is added for tax here.
-- Prices, stock, coupon rules and shipping come ONLY from the database; the browser's numbers are never trusted.
-- Phase B4 calls this same function when it creates an order.
drop function if exists public.quote_cart(jsonb, text);  -- replaced by the 3-argument version below
create or replace function public.quote_cart(p_items jsonb, p_coupon text default null, p_payment text default 'prepaid')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.shop_settings;
  c          public.coupons;
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
    if not found or not c.active or (c.expires_at is not null and c.expires_at < now()) then
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
