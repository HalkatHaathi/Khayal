-- Phase B5: hardening from the security review. Safe to re-run. Needs 0001-0003 applied first.
-- Adds size limits so a signed-in user cannot store huge blobs in their own rows.

alter table public.user_carts drop constraint if exists user_carts_size;
alter table public.user_carts add constraint user_carts_size check (pg_column_size(items) <= 60000);

alter table public.profiles drop constraint if exists profiles_lengths;
alter table public.profiles add constraint profiles_lengths check (length(full_name) <= 100 and (phone is null or length(phone) <= 15));

alter table public.addresses drop constraint if exists addresses_lengths;
alter table public.addresses add constraint addresses_lengths check (
  length(name) <= 100 and length(phone) <= 15 and length(line1) <= 200 and coalesce(length(line2), 0) <= 200
  and length(city) <= 100 and length(state) <= 100);

-- the sign-up trigger function must never be callable as an API function
revoke all on function public.handle_new_user() from public, anon, authenticated;
