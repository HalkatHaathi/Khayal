-- Admin phase 2: shipping details on orders, an inbox that can be marked handled, unsubscribes. Safe to re-run. Needs 0001-0004 first.

alter table public.orders add column if not exists courier         text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists admin_note      text;
alter table public.orders drop constraint if exists orders_admin_lengths;
alter table public.orders add constraint orders_admin_lengths check (
  coalesce(length(courier), 0) <= 60 and coalesce(length(tracking_number), 0) <= 80 and coalesce(length(admin_note), 0) <= 1000);

-- orders are never UPDATEd from the browser; this is the only way to touch the shipping fields
create or replace function public.admin_update_order(p_order uuid, p_courier text, p_tracking text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.orders set
    courier = nullif(trim(coalesce(p_courier, '')), ''),
    tracking_number = nullif(trim(coalesce(p_tracking, '')), ''),
    admin_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_order;
  if not found then raise exception 'order_not_found'; end if;
end $$;
revoke all on function public.admin_update_order(uuid, text, text, text) from public;
grant execute on function public.admin_update_order(uuid, text, text, text) to authenticated;

-- inbox
alter table public.contact_messages add column if not exists handled boolean not null default false;
drop policy if exists "admin update" on public.contact_messages;
create policy "admin update" on public.contact_messages for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete" on public.contact_messages;
create policy "admin delete" on public.contact_messages for delete using (public.is_admin());

-- unsubscribes
drop policy if exists "admin delete" on public.newsletter_subscribers;
create policy "admin delete" on public.newsletter_subscribers for delete using (public.is_admin());
