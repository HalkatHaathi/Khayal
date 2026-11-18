-- Phase B5a / admin site, phase 1: admin access + product image storage. Safe to re-run. Needs 0001-0003 first.
-- An admin is a signed-in user listed in public.admins. Everything below is enforced by the database,
-- so the /admin pages in the browser are only a convenience: a non-admin gets no data even if they open them.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admin reads self" on public.admins;
create policy "admin reads self" on public.admins for select using (user_id = auth.uid());
-- no insert/update/delete policies: admins are added only from the SQL Editor (service role), never from the browser

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- admin read access ----------
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'contact_messages', 'newsletter_subscribers', 'products', 'product_sizes', 'product_images', 'profiles'] loop
    execute format('drop policy if exists "admin read" on public.%I', t);
    execute format('create policy "admin read" on public.%I for select using (public.is_admin())', t);
  end loop;
end $$;

-- ---------- admin write access (catalogue, coupons, settings) ----------
do $$
declare t text;
begin
  foreach t in array array['coupons', 'products', 'product_sizes', 'product_images', 'shop_settings', 'collections', 'collection_products'] loop
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format('create policy "admin write" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------- order status changes (never a direct UPDATE: stock must be handled) ----------
-- allowed moves:  pending -> cancelled | failed     confirmed -> shipped | cancelled
--                 paid -> shipped | cancelled        shipped -> delivered
-- cancelling or failing an order that still holds stock gives the stock back.
create or replace function public.admin_set_order_status(p_order uuid, p_status public.order_status)
returns public.order_status
language plpgsql security definer set search_path = public as $$
declare cur public.order_status; pay text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select status, payment_method into cur, pay from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;

  if not (
    (cur = 'pending'   and p_status in ('cancelled', 'failed')) or
    (cur = 'confirmed' and p_status in ('shipped', 'cancelled')) or
    (cur = 'paid'      and p_status in ('shipped', 'cancelled')) or
    (cur = 'shipped'   and p_status = 'delivered')
  ) then raise exception 'invalid_transition'; end if;

  if p_status in ('cancelled', 'failed') then
    update public.product_sizes ps set stock = ps.stock + i.q
    from (select product_id, size, sum(qty)::integer as q from public.order_items
          where order_id = p_order and product_id is not null group by 1, 2) i
    where ps.product_id = i.product_id and ps.size = i.size;
  end if;

  update public.orders set
    status = p_status,
    expires_at = null,
    -- cash on delivery is paid when it is delivered
    paid_at = case when p_status = 'delivered' and pay = 'cod' then coalesce(paid_at, now()) else paid_at end
  where id = p_order;
  return p_status;
end $$;
revoke all on function public.admin_set_order_status(uuid, public.order_status) from public;
grant execute on function public.admin_set_order_status(uuid, public.order_status) to authenticated;

-- ---------- product photos: public bucket, only admins may write ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
do $$
declare op text;
begin
  foreach op in array array['insert', 'update', 'delete'] loop
    execute format('drop policy if exists "admin images %s" on storage.objects', op);
  end loop;
end $$;
create policy "admin images insert" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy "admin images update" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_admin());
create policy "admin images delete" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

-- ---------- make yourself an admin ----------
-- 1. Create your account on the site (/account/register) and confirm the email.
-- 2. In the SQL Editor run, with YOUR email:
--      insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
