-- THE BRIDGE — Migration 002
-- Let household members view each other's profiles and sync crew changes.

create policy "Household members can view fellow crew profiles"
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.household_members me
    join public.household_members them
      on them.household_id = me.household_id
    where me.user_id = auth.uid()
      and them.user_id = profiles.user_id
  )
);

alter publication supabase_realtime add table public.household_members;
alter publication supabase_realtime add table public.profiles;
