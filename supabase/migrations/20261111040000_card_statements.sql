-- Card due dates (#7, Nov 11 2026): one row per card statement, as printed on
-- it: the day it closed, when payment is due, the statement balance and the
-- minimum payment. Filled by statement imports (and once from the statements
-- loaded at setup). Read by Claude; shown as facts only.
create table public.card_statements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  account_id     uuid not null references public.accounts on delete cascade,
  closing_date   date not null,
  due_date       date,
  balance_cents  bigint,
  minimum_cents  bigint,
  import_id      uuid references public.imports on delete set null,
  created_at     timestamptz not null default now(),
  unique (account_id, closing_date)
);

alter table public.card_statements enable row level security;
create policy owner_all on public.card_statements for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.card_statements to authenticated;
grant all on public.card_statements to service_role;
