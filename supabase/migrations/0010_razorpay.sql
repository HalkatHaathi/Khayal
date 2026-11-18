-- Online payments with Razorpay. Safe to re-run. Needs 0001-0004 and 0006.
-- Razorpay is only ever called from the `pay` Edge Function (keys stay on the server). The database is the judge of what counts as paid.

alter table public.orders add column if not exists rzp_order_id   text;   -- the Razorpay order this shop order is paid through
alter table public.orders add column if not exists rzp_payment_id text;   -- the payment that settled it
alter table public.orders add column if not exists refund_id      text;
alter table public.orders add column if not exists refund_amount  integer;
alter table public.orders add column if not exists refunded_at    timestamptz;
create unique index if not exists orders_rzp_order_idx on public.orders (rzp_order_id) where rzp_order_id is not null;

-- ---------- settle a captured payment against an order: one transaction, row-locked, safe to call twice ----------
-- returns: paid      this call marked the order paid
--          already   same payment, already recorded (a retry or the webhook arriving after the browser)
--          duplicate a SECOND payment for an order that is already paid  -> the caller refunds it
--          late      the order was cancelled/failed/released while the customer was paying -> the caller refunds it
--          mismatch  wrong Razorpay order, wrong amount, or not an online order -> the caller refunds it
--          missing   no such order
create or replace function public.apply_payment(p_order uuid, p_rzp_order text, p_payment text, p_paise bigint)
returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then return 'missing'; end if;
  if o.payment_method <> 'prepaid' or o.rzp_order_id is distinct from p_rzp_order or p_paise <> o.total::bigint * 100 then return 'mismatch'; end if;
  if o.status in ('paid', 'shipped', 'delivered') then
    return case when o.rzp_payment_id = p_payment then 'already' else 'duplicate' end;
  end if;
  if o.status = 'pending' then
    -- an expired hold that has not been released yet still has its stock reserved, so the payment is honoured
    update public.orders set status = 'paid', paid_at = now(), gateway_ref = p_payment, rzp_payment_id = p_payment, expires_at = null where id = o.id;
    return 'paid';
  end if;
  return 'late';
end $$;
revoke all on function public.apply_payment(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.apply_payment(uuid, text, text, bigint) to service_role;

-- ---------- the order page also needs to know when the hold ends and whether it was refunded ----------
create or replace function public.get_order(p_id uuid, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'payment_method', o.payment_method, 'created_at', o.created_at,
    'subtotal', o.subtotal, 'discount', o.discount, 'shipping', o.shipping, 'cod_fee', o.cod_fee, 'total', o.total,
    'customer_name', o.customer_name, 'address', o.shipping_address,
    'expires_at', o.expires_at, 'refunded', o.refunded_at is not null,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'set', i.set_name, 'pants', i.pants_size, 'qty', i.qty, 'unit_price', i.unit_price)), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id))
  from public.orders o
  where o.id = p_id and (o.phone = regexp_replace(coalesce(p_phone, ''), '\s', '', 'g') or (auth.uid() is not null and o.user_id = auth.uid()));
$$;
revoke all on function public.get_order(uuid, text) from public;
grant execute on function public.get_order(uuid, text) to anon, authenticated;
