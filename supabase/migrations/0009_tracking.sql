-- Public tracking page (/track): look an order up by its number plus the mobile number used at checkout. Safe to re-run. Needs 0008.
-- The phone number is the proof, as in get_order(). Only what a customer should see is returned: no label link, no Shiprocket ids,
-- no street address (city, state and pincode only).
create or replace function public.track_order(p_number bigint, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'created_at', o.created_at, 'payment_method', o.payment_method, 'total', o.total,
    'name', o.customer_name,
    'city', o.shipping_address->>'city', 'state', o.shipping_address->>'state', 'pincode', o.shipping_address->>'pincode',
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.qty)), '[]'::jsonb) from public.order_items i where i.order_id = o.id),
    'shipment', (select jsonb_build_object('awb', s.awb, 'courier', s.courier, 'status', s.status, 'etd', s.etd,
                   'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'activity', e.activity, 'location', e.location) order by e.at desc), '[]'::jsonb)
                              from public.shipment_events e where e.order_id = s.order_id))
                 from public.shipments s where s.order_id = o.id and s.awb is not null))
  from public.orders o
  where o.number = p_number and o.phone = regexp_replace(coalesce(p_phone, ''), '\s', '', 'g');
$$;
revoke all on function public.track_order(bigint, text) from public;
grant execute on function public.track_order(bigint, text) to anon, authenticated;
