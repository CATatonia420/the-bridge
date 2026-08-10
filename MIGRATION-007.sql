-- THE BRIDGE v0.7 — Notes
create table public.notes (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 author_user_id uuid not null references auth.users(id) on delete cascade, author_name_snapshot text not null,
 recipient_user_id uuid references auth.users(id) on delete set null, recipient_name_snapshot text,
 note_type text not null default 'sticky' check(note_type in ('sticky','for_you','doodle')), body text, color text not null default '#7d5266',
 needs_action boolean not null default false, action_completed_at timestamptz, action_completed_by uuid references auth.users(id) on delete set null,
 reminder_at timestamptz, pinned boolean not null default true, dismissed_at timestamptz, opened_at timestamptz, hoarded_at timestamptz,
 captain_log_saved_at timestamptz, photo_path text, doodle_path text, deleted_at timestamptz,
 expires_at timestamptz not null default(now()+interval '3 months'), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.note_versions (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 note_id uuid not null references public.notes(id) on delete cascade, body text, color text, needs_action boolean, reminder_at timestamptz,
 photo_path text, doodle_path text, saved_at timestamptz not null default now(), saved_by uuid references auth.users(id) on delete set null
);
create table public.note_comments (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 note_id uuid not null references public.notes(id) on delete cascade, author_user_id uuid not null references auth.users(id) on delete cascade,
 author_name_snapshot text not null, body text not null, created_at timestamptz not null default now()
);
create table public.note_reactions (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 note_id uuid not null references public.notes(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 reaction text not null, created_at timestamptz not null default now(), unique(note_id,user_id,reaction)
);
create table public.captains_log (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 source_note_id uuid references public.notes(id) on delete set null, title text, body text, author_user_id uuid references auth.users(id) on delete set null,
 author_name_snapshot text, photo_path text, doodle_path text, created_at timestamptz not null default now()
);
alter table public.notes enable row level security; alter table public.note_versions enable row level security;
alter table public.note_comments enable row level security; alter table public.note_reactions enable row level security; alter table public.captains_log enable row level security;
grant select,insert,update,delete on public.notes,public.note_versions,public.note_comments,public.note_reactions,public.captains_log to authenticated;
create policy "crew reads notes" on public.notes for select to authenticated using(public.is_household_member(household_id));
create policy "crew creates notes" on public.notes for insert to authenticated with check(public.is_household_member(household_id) and author_user_id=auth.uid());
create policy "crew updates notes" on public.notes for update to authenticated using(public.is_household_member(household_id) and (author_user_id=auth.uid() or recipient_user_id=auth.uid())) with check(public.is_household_member(household_id));
create policy "crew deletes notes" on public.notes for delete to authenticated using(public.is_household_member(household_id));
create policy "crew note versions" on public.note_versions for all to authenticated using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
create policy "crew note comments" on public.note_comments for all to authenticated using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
create policy "crew note reactions" on public.note_reactions for all to authenticated using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
create policy "crew captains log" on public.captains_log for all to authenticated using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
insert into storage.buckets(id,name,public) values('note-media','note-media',false) on conflict(id) do nothing;
create policy "crew reads note media" on storage.objects for select to authenticated using(bucket_id='note-media' and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid));
create policy "crew uploads note media" on storage.objects for insert to authenticated with check(bucket_id='note-media' and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid));
create policy "crew deletes note media" on storage.objects for delete to authenticated using(bucket_id='note-media' and public.is_household_member(nullif((storage.foldername(name))[1],'')::uuid));
alter publication supabase_realtime add table public.notes; alter publication supabase_realtime add table public.note_comments;
alter publication supabase_realtime add table public.note_reactions; alter publication supabase_realtime add table public.captains_log;
