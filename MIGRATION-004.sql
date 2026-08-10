
create table if not exists public.task_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#777777',
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id,name)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  notes text,
  category_id uuid references public.task_categories(id) on delete set null,
  assignment_type text not null default 'either'
    check (assignment_type in ('specific','either','both')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'needs_doing'
    check (status in ('needs_doing','done')),
  recurrence_type text not null default 'none'
    check (recurrence_type in ('none','daily','weekly','monthly','custom_days')),
  recurrence_interval integer not null default 1 check (recurrence_interval>=1),
  parent_recurring_task_id uuid references public.tasks(id) on delete set null,
  photo_path text,
  created_by uuid not null references auth.users(id) on delete cascade,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  text text not null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.task_categories enable row level security;
alter table public.tasks enable row level security;
alter table public.task_subtasks enable row level security;

grant select,insert,update,delete on public.task_categories,public.tasks,public.task_subtasks to authenticated;

create policy "crew controls task categories" on public.task_categories for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "crew controls tasks" on public.tasks for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "crew controls subtasks" on public.task_subtasks for all to authenticated
using (exists(select 1 from public.tasks t where t.id=task_id and public.is_household_member(t.household_id)))
with check (exists(select 1 from public.tasks t where t.id=task_id and public.is_household_member(t.household_id)));

insert into storage.buckets (id,name,public) values ('task-photos','task-photos',false)
on conflict (id) do nothing;

create policy "crew reads task photos" on storage.objects for select to authenticated
using (bucket_id='task-photos' and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid));

create policy "crew uploads task photos" on storage.objects for insert to authenticated
with check (bucket_id='task-photos' and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid));

create policy "crew deletes task photos" on storage.objects for delete to authenticated
using (bucket_id='task-photos' and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid));

alter publication supabase_realtime add table public.task_categories;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_subtasks;
