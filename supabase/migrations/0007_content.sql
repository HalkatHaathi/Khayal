-- Admin phase 3: storefront content you can edit without a deploy. Safe to re-run. Needs 0004 (is_admin) first.
-- site_content: one JSON document per area ('home', 'menus', 'site'). Missing row = the storefront's built-in default.
-- pages: about, contact, policies and any page you add (shown at /pages/<slug>).

create table if not exists public.site_content (
  key        text primary key check (key in ('home', 'menus', 'site')),
  value      jsonb not null check (pg_column_size(value) <= 200000),
  updated_at timestamptz not null default now()
);
create table if not exists public.pages (
  slug       text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  title      text not null check (length(title) between 1 and 120),
  body       jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array' and pg_column_size(body) <= 100000),  -- [{h, t}]
  published  boolean not null default true,
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
alter table public.pages        enable row level security;
drop policy if exists "content read"  on public.site_content;
drop policy if exists "content write" on public.site_content;
create policy "content read"  on public.site_content for select using (true);
create policy "content write" on public.site_content for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pages read"  on public.pages;
drop policy if exists "pages write" on public.pages;
create policy "pages read"  on public.pages for select using (published or public.is_admin());
create policy "pages write" on public.pages for all using (public.is_admin()) with check (public.is_admin());

-- photos for banners, tiles and the story: public bucket, only admins write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "admin site images insert" on storage.objects;
drop policy if exists "admin site images update" on storage.objects;
drop policy if exists "admin site images delete" on storage.objects;
create policy "admin site images insert" on storage.objects for insert to authenticated with check (bucket_id = 'site-images' and public.is_admin());
create policy "admin site images update" on storage.objects for update to authenticated using (bucket_id = 'site-images' and public.is_admin());
create policy "admin site images delete" on storage.objects for delete to authenticated using (bucket_id = 'site-images' and public.is_admin());

-- the placeholder copy the storefront shipped with, so the editor has something to start from
insert into public.pages (slug, title, body, sort) values
 ('about', 'About Khyal', '[{"h":"Rooted in Stories","t":"Khyal is a streetwear label built on craft, culture and contemporary expression, stitched together with purpose. Every piece starts with a story and an artisan who can tell it in cloth."},{"h":"Made by hand","t":"Block printing, hand embroidery and screen printing are done in small batches by the people who know the work best. That is why some pieces sell out and are never restocked."}]', 0),
 ('contact', 'Contact us', '[{"h":"We read every message","t":"Questions about an order, a fit or a collaboration: write to us and we will reply within two working days."}]', 1),
 ('shipping', 'Shipping policy', '[{"h":"Delivery times","t":"Orders ship within 3–5 working days and reach most addresses in India in 4–7 days."},{"h":"Shipping charges","t":"Shipping is free on orders of Rs. 15,000 and above. Charges for smaller orders are shown at checkout."}]', 2),
 ('returns', 'Returns & Exchange', '[{"h":"Exchanges","t":"Unworn pieces with tags can be exchanged within 7 days of delivery, subject to stock."},{"h":"Final sale","t":"Limited-edition and sale pieces cannot be returned or exchanged."}]', 3),
 ('privacy', 'Privacy Policy', '[{"h":"What we collect","t":"Details you give us when you order, sign up or contact us: name, email, phone number and delivery address."},{"h":"How we use it","t":"To fulfil orders, answer questions and, if you opt in, send updates. We do not sell your data."}]', 4),
 ('terms', 'Terms of Service', '[{"h":"Using this site","t":"By using this site and placing an order you agree to these terms and to our shipping and returns policies."},{"h":"Pricing","t":"Prices are in Indian rupees and may change without notice. An order is confirmed once payment succeeds."}]', 5)
on conflict (slug) do nothing;
