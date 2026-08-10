
-- THE BRIDGE v0.7.3 — shared note controls
drop policy if exists "crew updates notes" on public.notes;
create policy "crew updates notes" on public.notes for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));
