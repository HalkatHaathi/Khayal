-- Khayal storefront schema (Phase B1). Prices are whole rupees (integers).
-- Writes to orders/stock happen only from Edge Functions using the service role; the browser can only read the catalogue.

create extension if not exists pgcrypto;

-- ---------- catalogue ----------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  type        text not null,                      -- T-shirts, Jackets, Kurtas, ...
  kind        text not null check (kind in ('tee','long','kurta')),  -- placeholder silhouette until real photos exist
  craft       text not null default '',
  description text not null default '',
  price       integer not null check (price >= 0),
  compare_at  integer check (compare_at is null or compare_at > price),
  price_from  boolean not null default false,     -- show "From Rs. X"
  pants_addon integer check (pants_addon is null or pants_addon >= 0), -- kurta "with pants" surcharge
  tone        text not null default '#cfc8bd',
  alt_tone    text not null default '#b9b2a6',
  fit         text not null default 'Men',
  sort        integer not null default 0,         -- lower = newer/first
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.product_sizes (
  product_id uuid not null references public.products(id) on delete cascade,
  size       text not null,
  stock      integer not null default 0 check (stock >= 0),
  primary key (product_id, size)
);

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null,
  alt        text not null default '',
  position   integer not null default 0
);
create index on public.product_images (product_id, position);

create table public.collections (
  slug         text primary key,
  title        text not null,
  type_filter  text,                              -- dynamic: every product of this type
  on_sale      boolean not null default false,    -- dynamic: products with compare_at
  all_products boolean not null default false,
  sort         integer not null default 0
);

create table public.collection_products (          -- manual collections (aw26, viraam, best-sellers)
  collection_slug text not null references public.collections(slug) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  position        integer not null default 0,
  primary key (collection_slug, product_id)
);

-- ---------- customers ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  phone      text,
  created_at timestamptz not null default now()
);

create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  phone      text not null,
  line1      text not null,
  line2      text,
  city       text not null,
  state      text not null,
  pincode    text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false
);
create index on public.addresses (user_id);

-- creates an empty profile whenever someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- commerce ----------
create table public.coupons (
  code            text primary key check (code = upper(code)),
  percent         integer not null check (percent between 1 and 100),
  min_subtotal    integer not null default 0,
  first_order_only boolean not null default false,
  active          boolean not null default true,
  expires_at      timestamptz
);

create type public.order_status as enum ('pending','paid','failed','cancelled','shipped','delivered');

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  number           bigint generated always as identity (start with 1001),
  user_id          uuid references auth.users(id) on delete set null,
  email            text,
  phone            text not null,
  status           public.order_status not null default 'pending',
  subtotal         integer not null check (subtotal >= 0),
  discount         integer not null default 0 check (discount >= 0),
  shipping         integer not null default 0 check (shipping >= 0),
  total            integer not null check (total >= 0),
  coupon_code      text references public.coupons(code),
  is_gift          boolean not null default false,
  gift_note        text,
  shipping_address jsonb,
  gateway_ref      text unique,                   -- GoKwik order/payment reference, set in Phase B4
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);
create index on public.orders (user_id, created_at desc);

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name       text not null,                       -- snapshot: names and prices at purchase time
  size       text not null,
  set_name   text,
  pants_size text,
  unit_price integer not null check (unit_price >= 0),
  qty        integer not null check (qty > 0)
);
create index on public.order_items (order_id);

create table public.newsletter_subscribers (
  email      text primary key check (email ~ '^\S+@\S+\.\S+$' and length(email) <= 254),
  name       text check (length(name) <= 100),
  created_at timestamptz not null default now()
);

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 100),
  email      text not null check (email ~ '^\S+@\S+\.\S+$' and length(email) <= 254),
  message    text not null check (length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- ---------- row-level security ----------
alter table public.products               enable row level security;
alter table public.product_sizes          enable row level security;
alter table public.product_images         enable row level security;
alter table public.collections            enable row level security;
alter table public.collection_products    enable row level security;
alter table public.profiles               enable row level security;
alter table public.addresses              enable row level security;
alter table public.coupons                enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.contact_messages       enable row level security;

-- public catalogue: read-only
create policy "catalogue read"  on public.products            for select using (is_active);
create policy "sizes read"      on public.product_sizes       for select using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "images read"     on public.product_images      for select using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "collections read" on public.collections        for select using (true);
create policy "collection items read" on public.collection_products for select using (true);

-- customers: own rows only
create policy "own profile read"   on public.profiles  for select using (id = auth.uid());
create policy "own profile update" on public.profiles  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "own addresses"      on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orders: customers may read their own; nobody writes from the browser (service role bypasses RLS)
create policy "own orders read"      on public.orders      for select using (user_id = auth.uid());
create policy "own order items read" on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- coupons: no browser access at all; validated server-side (Phase B3)

-- forms: anyone may submit, nobody may read back
create policy "newsletter signup" on public.newsletter_subscribers for insert with check (true);
create policy "contact submit"    on public.contact_messages        for insert with check (true);
