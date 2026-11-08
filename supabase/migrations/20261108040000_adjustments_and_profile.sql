-- Balance adjustments (Cashew "Starting Point", Money Pro year-end reconcile):
-- shown in summaries, but neither income nor spending.
alter table public.categories drop constraint categories_kind_check;
alter table public.categories add constraint categories_kind_check
  check (kind in ('expense','income','transfer','reimbursement','adjustment'));

-- Owner profile: greeting name and the headline monthly budget (owner, Nov 8 2026: $3,000).
create table public.profiles (
  user_id               uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name          text,
  monthly_budget_cents  bigint check (monthly_budget_cents >= 0),
  updated_at            timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy owner_all on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
