-- Admin phase 5: Shiprocket shipments and tracking shown on the storefront. Safe to re-run. Needs 0001-0004 and 0006.
-- Shiprocket is only ever called from the Edge Functions in supabase/functions (secrets stay on the server).

create table if not exists public.shipments (
  order_id         uuid primary key references public.orders(id) on delete cascade,   -- one shipment per order
  sr_order_id      bigint,
  sr_shipment_id   bigint,
  awb              text unique,
  courier          text,
  status           text not null default 'created'
    check (status in ('created', 'awaiting_pickup', 'in_transit', 'out_for_delivery', 'delivered', 'attention', 'rto', 'cancelled')),
  status_label     text,                 -- Shiprocket's own wording, for the admin
  label_url        text,                 -- shipping label PDF: admin only, never sent to customers
  etd              timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create table if not exists public.shipment_events (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references public.orders(id) on delete cascade,
  at        timestamptz not null,
  status    text,
  activity  text not null,
  location  text,
  unique (order_id, at, activity)        -- webhooks repeat themselves; this makes inserts idempotent
);
create index if not exists shipment_events_order_idx on public.shipment_events (order_id, at desc);

alter table public.shipments       enable row level security;
alter table public.shipment_events enable row level security;
drop policy if exists "admin read" on public.shipments;
drop policy if exists "admin read" on public.shipment_events;
create policy "admin read" on public.shipments       for select using (public.is_admin());
create policy "admin read" on public.shipment_events for select using (public.is_admin());
-- no write policies: only the Edge Functions (service role) write these tables

-- the pickup location NAME exactly as it appears in Shiprocket > Settings > Pickup Addresses
alter table public.shop_settings add column if not exists shiprocket_pickup text not null default 'Primary' check (length(shiprocket_pickup) between 1 and 60);

-- ---------- called by the Edge Functions: record a status change and move the order along ----------
create or replace function public.apply_shipment_update(
  p_awb text, p_status text, p_status_label text, p_events jsonb, p_etd timestamptz, p_courier text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare sh public.shipments; o public.orders;
begin
  select * into sh from public.shipments where awb = p_awb for update;
  if not found then return false; end if;

  insert into public.shipment_events (order_id, at, status, activity, location)
  select sh.order_id, (e->>'at')::timestamptz, e->>'status', left(e->>'activity', 300), left(e->>'location', 200)
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e
  where coalesce(e->>'activity', '') <> '' and coalesce(e->>'at', '') <> ''
  on conflict do nothing;

  update public.shipments set
    status = p_status, status_label = coalesce(p_status_label, status_label), etd = coalesce(p_etd, etd),
    courier = coalesce(nullif(p_courier, ''), courier), updated_at = now()
  where order_id = sh.order_id;

  select * into o from public.orders where id = sh.order_id for update;
  if p_status in ('in_transit', 'out_for_delivery') and o.status in ('confirmed', 'paid') then
    update public.orders set status = 'shipped', expires_at = null where id = o.id;
  elsif p_status = 'delivered' and o.status in ('confirmed', 'paid', 'shipped') then
    update public.orders set status = 'delivered', expires_at = null,
      paid_at = case when payment_method = 'cod' then coalesce(paid_at, now()) else paid_at end where id = o.id;
  end if;
  -- rto / cancelled / attention are shown to the admin but never change the order or its stock by themselves
  return true;
end $$;
revoke all on function public.apply_shipment_update(text, text, text, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_shipment_update(text, text, text, jsonb, timestamptz, text) to service_role;

-- ---------- what the customer's order page may see (same proof as get_order: the phone used, or being signed in) ----------
create or replace function public.get_tracking(p_id uuid, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'awb', s.awb, 'courier', s.courier, 'status', s.status, 'etd', s.etd,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'activity', e.activity, 'location', e.location) order by e.at desc), '[]'::jsonb)
               from public.shipment_events e where e.order_id = s.order_id))
  from public.shipments s join public.orders o on o.id = s.order_id
  where s.order_id = p_id and s.awb is not null
    and (o.phone = regexp_replace(coalesce(p_phone, ''), '\s', '', 'g') or (auth.uid() is not null and o.user_id = auth.uid()));
$$;
revoke all on function public.get_tracking(uuid, text) from public;
grant execute on function public.get_tracking(uuid, text) to anon, authenticated;
