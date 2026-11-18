-- Per-product photo layout on the product page, chosen in the admin. Safe to re-run. 'feature' is what every product used before.
alter table public.products add column if not exists gallery_layout text not null default 'feature';
alter table public.products drop constraint if exists products_gallery_layout_check;
alter table public.products add constraint products_gallery_layout_check check (gallery_layout in ('feature', 'pairs', 'stack', 'alternate', 'carousel'));
