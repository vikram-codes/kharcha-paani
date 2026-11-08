-- Budgets are planned per "budget line" (§7.7): one line can cover several
-- categories (e.g. "Shopping & personal care" = clothing + online + haircut + …).
-- A line has a default monthly amount; `budgets` holds per-month overrides
-- (e.g. Affirm's final payments in Nov 2026). The old per-category table was never used.
drop table if exists public.budgets;

create table public.budget_lines (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  key            text not null,
  name           text not null,
  kind           text not null check (kind in ('fixed','variable')),
  default_cents  bigint not null check (default_cents >= 0),
  icon           text,
  color          text,
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (user_id, key)
);

create table public.budget_line_categories (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  line_id      uuid not null references public.budget_lines on delete cascade,
  category_id  uuid not null references public.categories on delete cascade,
  primary key (line_id, category_id),
  unique (user_id, category_id)              -- a category counts toward one line only
);

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  line_id       uuid not null references public.budget_lines on delete cascade,
  month         date not null check (extract(day from month) = 1),
  amount_cents  bigint not null check (amount_cents >= 0),
  note          text,
  unique (user_id, line_id, month)
);

-- Fixed monthly payment counted for a loan (student loan EMI = $510 CAD).
alter table public.accounts add column monthly_payment_cents bigint check (monthly_payment_cents >= 0);

do $$
declare t text;
begin
  foreach t in array array['budget_lines','budget_line_categories','budgets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
