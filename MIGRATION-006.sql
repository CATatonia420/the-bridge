
-- ============================================================
-- THE BRIDGE — Migration 006
-- Treasury: bills, payment history, debts, debt history
-- ============================================================

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  amount numeric(12,2),
  usual_amount numeric(12,2),
  due_at timestamptz not null,
  recurrence_type text not null default 'one_off'
    check (recurrence_type in ('one_off','days','weeks','months','custom')),
  recurrence_interval integer not null default 1 check (recurrence_interval >= 1),
  custom_recurrence_note text,
  reminder_days integer not null default 1 check (reminder_days between 0 and 3),
  reminder_type text not null default 'in_app'
    check (reminder_type in ('in_app','notification','both')),
  notes text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete set null,
  bill_name text not null,
  expected_amount numeric(12,2),
  paid_amount numeric(12,2) not null check (paid_amount >= 0),
  due_at timestamptz,
  paid_at timestamptz not null,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  creditor text,
  original_balance numeric(12,2) not null check (original_balance >= 0),
  current_balance numeric(12,2) not null check (current_balance >= 0),
  recurring_payment numeric(12,2),
  payment_frequency text,
  next_payment_at timestamptz,
  defeated_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.debt_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  event_type text not null check (event_type in ('payment','borrowing','correction')),
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  event_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.bills enable row level security;
alter table public.bill_payments enable row level security;
alter table public.debts enable row level security;
alter table public.debt_events enable row level security;

grant select,insert,update,delete on
  public.bills,
  public.bill_payments,
  public.debts,
  public.debt_events
to authenticated;

create policy "crew controls bills" on public.bills for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "crew controls bill payments" on public.bill_payments for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "crew controls debts" on public.debts for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "crew controls debt events" on public.debt_events for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

alter publication supabase_realtime add table public.bills;
alter publication supabase_realtime add table public.bill_payments;
alter publication supabase_realtime add table public.debts;
alter publication supabase_realtime add table public.debt_events;
