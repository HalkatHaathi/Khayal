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
-- generated by scripts/gen-seed.mjs: SAMPLE DATA, run on the dev project only. It replaces the whole catalogue.
begin;
delete from public.collection_products; delete from public.collections; delete from public.products; delete from public.coupons;
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('ember-contour-hoodie','Ember Contour Hoodie','Sweatshirts & Hoodies','long','Screen print +2','',12500,null,false,null,'#8e2f2c','#6e2220','Men',30);
insert into public.product_sizes select id,'M',8 from public.products where slug='ember-contour-hoodie';
insert into public.product_sizes select id,'L',8 from public.products where slug='ember-contour-hoodie';
insert into public.product_sizes select id,'XL',8 from public.products where slug='ember-contour-hoodie';
insert into public.product_sizes select id,'XXL',8 from public.products where slug='ember-contour-hoodie';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('sabz-bagh-jacket','''Sabz Bagh'' Jacket','Jackets','long','Hand embroidery +2','',50000,null,false,null,'#86b79c','#5f9479','Men',29);
insert into public.product_sizes select id,'S',0 from public.products where slug='sabz-bagh-jacket';
insert into public.product_sizes select id,'M',0 from public.products where slug='sabz-bagh-jacket';
insert into public.product_sizes select id,'L',0 from public.products where slug='sabz-bagh-jacket';
insert into public.product_sizes select id,'XL',0 from public.products where slug='sabz-bagh-jacket';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('trompe-sweatshirt','Trompe l''Oeil Sweatshirt','Sweatshirts & Hoodies','long','Screen print +1','',8000,null,false,null,'#d9d0bd','#b9ad92','Men',28);
insert into public.product_sizes select id,'S',0 from public.products where slug='trompe-sweatshirt';
insert into public.product_sizes select id,'M',0 from public.products where slug='trompe-sweatshirt';
insert into public.product_sizes select id,'L',0 from public.products where slug='trompe-sweatshirt';
insert into public.product_sizes select id,'XXL',0 from public.products where slug='trompe-sweatshirt';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('night-jungle-jacket','Night Jungle Jacket','Jackets','long','Hand embroidery +2','',75000,null,false,null,'#1f2a44','#141b30','Men',27);
insert into public.product_sizes select id,'S',1 from public.products where slug='night-jungle-jacket';
insert into public.product_sizes select id,'M',1 from public.products where slug='night-jungle-jacket';
insert into public.product_sizes select id,'L',1 from public.products where slug='night-jungle-jacket';
insert into public.product_sizes select id,'XL',1 from public.products where slug='night-jungle-jacket';
insert into public.product_sizes select id,'XXL',1 from public.products where slug='night-jungle-jacket';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('ash-bomber','Ash Bomber','Jackets','long','Block print +1','',18500,null,false,null,'#9b9388','#7d766c','Men',26);
insert into public.product_sizes select id,'S',3 from public.products where slug='ash-bomber';
insert into public.product_sizes select id,'M',3 from public.products where slug='ash-bomber';
insert into public.product_sizes select id,'XL',3 from public.products where slug='ash-bomber';
insert into public.product_sizes select id,'XXL',3 from public.products where slug='ash-bomber';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('indigo-overshirt','Indigo Overshirt','Shirts','long','Hand embroidery','',14000,null,false,null,'#34476b','#26344f','Men',25);
insert into public.product_sizes select id,'S',4 from public.products where slug='indigo-overshirt';
insert into public.product_sizes select id,'M',4 from public.products where slug='indigo-overshirt';
insert into public.product_sizes select id,'L',4 from public.products where slug='indigo-overshirt';
insert into public.product_sizes select id,'XXL',4 from public.products where slug='indigo-overshirt';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('persistence-tee','Persistence of Time T-Shirt','T-shirts','tee','Block print +1','',6000,null,false,null,'#1c1c1f','#2c2c31','Men',24);
insert into public.product_sizes select id,'S',5 from public.products where slug='persistence-tee';
insert into public.product_sizes select id,'M',5 from public.products where slug='persistence-tee';
insert into public.product_sizes select id,'XL',5 from public.products where slug='persistence-tee';
insert into public.product_sizes select id,'XXL',5 from public.products where slug='persistence-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('crow-theory-tee','Crow Theory T-Shirt','T-shirts','tee','Screen print','',5000,null,false,null,'#a9c4bd','#8eaba3','Men',23);
insert into public.product_sizes select id,'S',7 from public.products where slug='crow-theory-tee';
insert into public.product_sizes select id,'L',7 from public.products where slug='crow-theory-tee';
insert into public.product_sizes select id,'XL',7 from public.products where slug='crow-theory-tee';
insert into public.product_sizes select id,'XXL',7 from public.products where slug='crow-theory-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('mango-tee','Mango T-Shirt','T-shirts','tee','Spray paint +1','',5500,null,false,null,'#3f8f78','#d8d79a','Men',22);
insert into public.product_sizes select id,'S',3 from public.products where slug='mango-tee';
insert into public.product_sizes select id,'M',3 from public.products where slug='mango-tee';
insert into public.product_sizes select id,'L',3 from public.products where slug='mango-tee';
insert into public.product_sizes select id,'XXL',3 from public.products where slug='mango-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('gambler-tee','Gambler T-Shirt','T-shirts','tee','Block print +2','',6000,null,false,null,'#8a8a84','#6f6f69','Men',21);
insert into public.product_sizes select id,'S',5 from public.products where slug='gambler-tee';
insert into public.product_sizes select id,'M',5 from public.products where slug='gambler-tee';
insert into public.product_sizes select id,'L',5 from public.products where slug='gambler-tee';
insert into public.product_sizes select id,'XL',5 from public.products where slug='gambler-tee';
insert into public.product_sizes select id,'XXL',5 from public.products where slug='gambler-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('salt-tee','Salt Wash T-Shirt','T-shirts','tee','Spray paint','',5200,null,false,null,'#d6d1c6','#bdb7aa','Men',20);
insert into public.product_sizes select id,'S',8 from public.products where slug='salt-tee';
insert into public.product_sizes select id,'M',8 from public.products where slug='salt-tee';
insert into public.product_sizes select id,'L',8 from public.products where slug='salt-tee';
insert into public.product_sizes select id,'XL',8 from public.products where slug='salt-tee';
insert into public.product_sizes select id,'XXL',8 from public.products where slug='salt-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('dusk-tee','Dusk Tee','T-shirts','tee','Screen print +1','',5000,null,false,null,'#6a4a5a','#523646','Men',19);
insert into public.product_sizes select id,'S',2 from public.products where slug='dusk-tee';
insert into public.product_sizes select id,'M',2 from public.products where slug='dusk-tee';
insert into public.product_sizes select id,'L',2 from public.products where slug='dusk-tee';
insert into public.product_sizes select id,'XXL',2 from public.products where slug='dusk-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('azul-jersey','Azul Block-Printed Jersey','T-shirts','tee','Spray +2','',5000,null,true,null,'#e9eef5','#bcd0e6','Men',18);
insert into public.product_sizes select id,'S',5 from public.products where slug='azul-jersey';
insert into public.product_sizes select id,'L',5 from public.products where slug='azul-jersey';
insert into public.product_sizes select id,'XL',5 from public.products where slug='azul-jersey';
insert into public.product_sizes select id,'XXL',5 from public.products where slug='azul-jersey';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('nuit-jersey','Nuit Block-Printed Jersey','T-shirts','tee','Block printing +1','',5000,null,true,null,'#22345c','#182645','Men',17);
insert into public.product_sizes select id,'S',9 from public.products where slug='nuit-jersey';
insert into public.product_sizes select id,'M',9 from public.products where slug='nuit-jersey';
insert into public.product_sizes select id,'L',9 from public.products where slug='nuit-jersey';
insert into public.product_sizes select id,'XL',9 from public.products where slug='nuit-jersey';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('lal-jersey','Lal Embroidered Jersey','T-shirts','tee','Block printing +1','',5000,null,true,null,'#a42a2a','#7f1f1f','Men',16);
insert into public.product_sizes select id,'S',9 from public.products where slug='lal-jersey';
insert into public.product_sizes select id,'M',9 from public.products where slug='lal-jersey';
insert into public.product_sizes select id,'L',9 from public.products where slug='lal-jersey';
insert into public.product_sizes select id,'XL',9 from public.products where slug='lal-jersey';
insert into public.product_sizes select id,'XXL',9 from public.products where slug='lal-jersey';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('surkh-jersey','Surkh Jersey','T-shirts','tee','Block printing +1','',5000,null,true,null,'#b8352f','#8e2723','Men',15);
insert into public.product_sizes select id,'M',0 from public.products where slug='surkh-jersey';
insert into public.product_sizes select id,'L',0 from public.products where slug='surkh-jersey';
insert into public.product_sizes select id,'XL',0 from public.products where slug='surkh-jersey';
insert into public.product_sizes select id,'XXL',0 from public.products where slug='surkh-jersey';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('mauve-tee','Mauve Block Print Tee','T-shirts','tee','Block printing','',2250,null,false,null,'#b9a2a3','#9d8586','Men',14);
insert into public.product_sizes select id,'S',0 from public.products where slug='mauve-tee';
insert into public.product_sizes select id,'M',0 from public.products where slug='mauve-tee';
insert into public.product_sizes select id,'L',0 from public.products where slug='mauve-tee';
insert into public.product_sizes select id,'XL',0 from public.products where slug='mauve-tee';
insert into public.product_sizes select id,'XXL',0 from public.products where slug='mauve-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('clay-shirt','Clay Camp Shirt','Shirts','long','Block printing','',4200,null,false,null,'#c7a58d','#a98870','Men',13);
insert into public.product_sizes select id,'S',8 from public.products where slug='clay-shirt';
insert into public.product_sizes select id,'M',8 from public.products where slug='clay-shirt';
insert into public.product_sizes select id,'L',8 from public.products where slug='clay-shirt';
insert into public.product_sizes select id,'XL',8 from public.products where slug='clay-shirt';
insert into public.product_sizes select id,'XXL',8 from public.products where slug='clay-shirt';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('rose-blockprint-tee','Rose Blockprint Tee','T-shirts','tee','','',3759,4699,false,null,'#2a1f22','#3b2b30','Men',12);
insert into public.product_sizes select id,'S',4 from public.products where slug='rose-blockprint-tee';
insert into public.product_sizes select id,'M',4 from public.products where slug='rose-blockprint-tee';
insert into public.product_sizes select id,'L',4 from public.products where slug='rose-blockprint-tee';
insert into public.product_sizes select id,'XXL',4 from public.products where slug='rose-blockprint-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('mor-blockprint-tee','Mor Block Print Tee','T-shirts','tee','','',4699,null,false,null,'#1f1d1f','#322e32','Men',11);
insert into public.product_sizes select id,'S',5 from public.products where slug='mor-blockprint-tee';
insert into public.product_sizes select id,'M',5 from public.products where slug='mor-blockprint-tee';
insert into public.product_sizes select id,'L',5 from public.products where slug='mor-blockprint-tee';
insert into public.product_sizes select id,'XL',5 from public.products where slug='mor-blockprint-tee';
insert into public.product_sizes select id,'XXL',5 from public.products where slug='mor-blockprint-tee';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('sketch-shirt','Sketch Stripe Shirt','Shirts','long','','',5699,null,false,null,'#b9bbb8','#9ea09c','Men',10);
insert into public.product_sizes select id,'S',9 from public.products where slug='sketch-shirt';
insert into public.product_sizes select id,'M',9 from public.products where slug='sketch-shirt';
insert into public.product_sizes select id,'L',9 from public.products where slug='sketch-shirt';
insert into public.product_sizes select id,'XL',9 from public.products where slug='sketch-shirt';
insert into public.product_sizes select id,'XXL',9 from public.products where slug='sketch-shirt';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('daydream-shirt','Day Dreamer Shirt','Shirts','long','','',5599,null,false,null,'#d8b8ad','#bd9a8e','Men',9);
insert into public.product_sizes select id,'S',8 from public.products where slug='daydream-shirt';
insert into public.product_sizes select id,'M',8 from public.products where slug='daydream-shirt';
insert into public.product_sizes select id,'L',8 from public.products where slug='daydream-shirt';
insert into public.product_sizes select id,'XL',8 from public.products where slug='daydream-shirt';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('royal-heritage-kurta','Royal Heritage Kurta','Kurtas','kurta','Block print','',10000,null,true,4500,'#e6dfd0','#cfc6b2','Men',8);
insert into public.product_sizes select id,'S',9 from public.products where slug='royal-heritage-kurta';
insert into public.product_sizes select id,'M',9 from public.products where slug='royal-heritage-kurta';
insert into public.product_sizes select id,'L',9 from public.products where slug='royal-heritage-kurta';
insert into public.product_sizes select id,'XL',9 from public.products where slug='royal-heritage-kurta';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('dichotomy-kurta-black','Dichotomy Kurta Black','Kurtas','kurta','Digital print','',10000,null,true,4500,'#2c2f3a','#1d2029','Men',7);
insert into public.product_sizes select id,'S',3 from public.products where slug='dichotomy-kurta-black';
insert into public.product_sizes select id,'M',3 from public.products where slug='dichotomy-kurta-black';
insert into public.product_sizes select id,'XL',3 from public.products where slug='dichotomy-kurta-black';
insert into public.product_sizes select id,'XXL',3 from public.products where slug='dichotomy-kurta-black';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('greyscale-kurta','Greyscale Kurta','Kurtas','kurta','Hand embroidery +2','',10000,null,true,4500,'#ddd6c4','#c4bba5','Men',6);
insert into public.product_sizes select id,'S',0 from public.products where slug='greyscale-kurta';
insert into public.product_sizes select id,'M',0 from public.products where slug='greyscale-kurta';
insert into public.product_sizes select id,'L',0 from public.products where slug='greyscale-kurta';
insert into public.product_sizes select id,'XL',0 from public.products where slug='greyscale-kurta';
insert into public.product_sizes select id,'XXL',0 from public.products where slug='greyscale-kurta';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('thinking-loud-kurta','Thinking Loud Kurta','Kurtas','kurta','Block print +3','',12000,null,true,4500,'#16161a','#25252b','Men',5);
insert into public.product_sizes select id,'S',3 from public.products where slug='thinking-loud-kurta';
insert into public.product_sizes select id,'M',3 from public.products where slug='thinking-loud-kurta';
insert into public.product_sizes select id,'XL',3 from public.products where slug='thinking-loud-kurta';
insert into public.product_sizes select id,'XXL',3 from public.products where slug='thinking-loud-kurta';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('midnight-kurta','Midnight Kurta','Kurtas','kurta','Hand embroidery +2','',10000,null,true,4500,'#25365c','#1a2644','Men',4);
insert into public.product_sizes select id,'S',9 from public.products where slug='midnight-kurta';
insert into public.product_sizes select id,'L',9 from public.products where slug='midnight-kurta';
insert into public.product_sizes select id,'XL',9 from public.products where slug='midnight-kurta';
insert into public.product_sizes select id,'XXL',9 from public.products where slug='midnight-kurta';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('emerald-kurta','Emerald Kurta','Kurtas','kurta','Block print +1','',10000,null,true,4500,'#1d4a49','#143533','Men',3);
insert into public.product_sizes select id,'S',4 from public.products where slug='emerald-kurta';
insert into public.product_sizes select id,'M',4 from public.products where slug='emerald-kurta';
insert into public.product_sizes select id,'L',4 from public.products where slug='emerald-kurta';
insert into public.product_sizes select id,'XL',4 from public.products where slug='emerald-kurta';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('wide-leg-trouser','Wide Leg Trouser','Pants','long','Plain','',6500,null,false,null,'#3a2523','#2a1a18','Men',2);
insert into public.product_sizes select id,'28',0 from public.products where slug='wide-leg-trouser';
insert into public.product_sizes select id,'30',0 from public.products where slug='wide-leg-trouser';
insert into public.product_sizes select id,'32',0 from public.products where slug='wide-leg-trouser';
insert into public.product_sizes select id,'34',0 from public.products where slug='wide-leg-trouser';
insert into public.product_sizes select id,'36',0 from public.products where slug='wide-leg-trouser';
insert into public.products (slug,name,type,kind,craft,description,price,compare_at,price_from,pants_addon,tone,alt_tone,fit,sort) values ('charcoal-pant','Charcoal Pant','Pants','long','Plain','',5800,null,false,null,'#33353a','#25272b','Men',1);
insert into public.product_sizes select id,'28',5 from public.products where slug='charcoal-pant';
insert into public.product_sizes select id,'30',5 from public.products where slug='charcoal-pant';
insert into public.product_sizes select id,'32',5 from public.products where slug='charcoal-pant';
insert into public.product_sizes select id,'34',5 from public.products where slug='charcoal-pant';
insert into public.product_sizes select id,'36',5 from public.products where slug='charcoal-pant';
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('aw26','Autumn Winter ''26',null,false,false,0);
insert into public.collection_products select 'aw26',id,0 from public.products where slug='ember-contour-hoodie';
insert into public.collection_products select 'aw26',id,1 from public.products where slug='sabz-bagh-jacket';
insert into public.collection_products select 'aw26',id,2 from public.products where slug='trompe-sweatshirt';
insert into public.collection_products select 'aw26',id,3 from public.products where slug='night-jungle-jacket';
insert into public.collection_products select 'aw26',id,4 from public.products where slug='ash-bomber';
insert into public.collection_products select 'aw26',id,5 from public.products where slug='indigo-overshirt';
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('viraam','Viraam 3.0',null,false,false,1);
insert into public.collection_products select 'viraam',id,0 from public.products where slug='persistence-tee';
insert into public.collection_products select 'viraam',id,1 from public.products where slug='crow-theory-tee';
insert into public.collection_products select 'viraam',id,2 from public.products where slug='mango-tee';
insert into public.collection_products select 'viraam',id,3 from public.products where slug='gambler-tee';
insert into public.collection_products select 'viraam',id,4 from public.products where slug='salt-tee';
insert into public.collection_products select 'viraam',id,5 from public.products where slug='dusk-tee';
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('best-sellers','Best Sellers',null,false,false,2);
insert into public.collection_products select 'best-sellers',id,0 from public.products where slug='azul-jersey';
insert into public.collection_products select 'best-sellers',id,1 from public.products where slug='nuit-jersey';
insert into public.collection_products select 'best-sellers',id,2 from public.products where slug='lal-jersey';
insert into public.collection_products select 'best-sellers',id,3 from public.products where slug='surkh-jersey';
insert into public.collection_products select 'best-sellers',id,4 from public.products where slug='mauve-tee';
insert into public.collection_products select 'best-sellers',id,5 from public.products where slug='clay-shirt';
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('new-arrivals','New arrivals',null,false,true,3);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('t-shirts','T-shirts','T-shirts',false,false,4);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('jackets','Jackets','Jackets',false,false,5);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('kurtas','Kurtas','Kurtas',false,false,6);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('hoodies','Sweatshirts & Hoodies','Sweatshirts & Hoodies',false,false,7);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('shirts','Shirts','Shirts',false,false,8);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('bottoms','Bottoms','Pants',false,false,9);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('sale','Sale',null,true,false,10);
insert into public.collections (slug,title,type_filter,on_sale,all_products,sort) values ('women','Women',null,false,false,11);
insert into public.coupons (code,percent,min_subtotal,first_order_only) values ('KHAYAL10',10,0,true);
commit;
