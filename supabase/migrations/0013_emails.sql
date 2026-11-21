-- Email templates editable in the admin (Emails page). Stored in site_content under the key 'emails'. Safe to re-run. Needs 0007.
alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content add constraint site_content_key_check check (key in ('home', 'menus', 'site', 'emails'));
