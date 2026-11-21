-- Per-product switch: show shoppers how many are left ("Only 3 left in M"), or only whether a size is available. Safe to re-run.
alter table public.products add column if not exists show_stock boolean not null default true;
