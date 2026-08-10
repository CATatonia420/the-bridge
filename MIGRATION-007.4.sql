-- THE BRIDGE v0.7.4 — per-profile UI themes
alter table public.profiles
  add column if not exists ui_theme text not null default 'C';
