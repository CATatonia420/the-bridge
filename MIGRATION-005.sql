
-- ============================================================
-- THE BRIDGE — Migration 005
-- Cargo / Shopping
-- ============================================================

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#7b7f86',
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, name)
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  list_id uuid references public.shopping_lists(id) on delete set null,

  name text not null,
  quantity text,
  priority_type text not null default 'need'
    check (priority_type in ('need','want')),
  shop text,
  note text,
  photo_path text,

  is_favourite boolean not null default false,
  is_bought boolean not null default false,
  bought_by uuid references auth.users(id) on delete set null,
  bought_at timestamptz,

  archived boolean not null default false,
  archived_at timestamptz,

  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

grant select,insert,update,delete on public.shopping_lists,public.shopping_items to authenticated;

create policy "crew controls shopping lists"
on public.shopping_lists
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "crew controls shopping items"
on public.shopping_items
for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

insert into storage.buckets (id,name,public)
values ('shopping-photos','shopping-photos',false)
on conflict (id) do nothing;

create policy "crew reads shopping photos"
on storage.objects for select to authenticated
using (
  bucket_id='shopping-photos'
  and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid)
);

create policy "crew uploads shopping photos"
on storage.objects for insert to authenticated
with check (
  bucket_id='shopping-photos'
  and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid)
);

create policy "crew deletes shopping photos"
on storage.objects for delete to authenticated
using (
  bucket_id='shopping-photos'
  and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid)
);

alter publication supabase_realtime add table public.shopping_lists;
alter publication supabase_realtime add table public.shopping_items;
