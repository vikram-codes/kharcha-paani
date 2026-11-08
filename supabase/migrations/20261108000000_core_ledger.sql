-- Kharcha-Paani core ledger (BUILD_PROMPT §3, §5, §6, §7.1, §7.7, §7.8, §8).
--
-- Conventions
--   * Money is bigint cents, CAD. Amounts are signed from the owner's point of view:
--     negative = money out / card purchase (debt grows), positive = money in.
--   * Account balances use the same sign: a card owing $2,730 has balance -273000.
--     The UI shows debts as positive "owed" numbers.
--   * A balance is anchored: latest balance_snapshot + transactions dated AFTER it.
--     Entering older transactions later is absorbed by the anchor, so a
--     reconciliation gap "shrinks automatically" (§4.1).
--   * Every table has user_id + RLS (user_id = auth.uid()).

-- ───────────────────────────── accounts ─────────────────────────────
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  key             text not null,                       -- stable slug used by importers/seed
  name            text not null,
  account_group   text not null check (account_group in
                    ('cash_bank','cash_emergency','debt_card','debt_loan','investment','legacy')),
  institution     text,
  last4           text check (last4 ~ '^\d{4}$'),
  credit_limit_cents bigint check (credit_limit_cents >= 0),
  apr             numeric(5,2),
  currency        text not null default 'CAD' check (currency in ('CAD','INR')),
  hidden          boolean not null default false,      -- emergency fund: masked until revealed
  sort_order      int not null default 0,
  archived        boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  unique (user_id, key)
);

-- Anchored balances: opening balance, manual values (investments, INR loan),
-- and reconciliations all live here.
create table public.balance_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  account_id    uuid not null references public.accounts on delete cascade,
  as_of         date not null,
  amount_cents  bigint not null,                       -- signed, CAD
  native_amount numeric(14,2),                         -- e.g. INR balance for the student loan
  fx_rate       numeric(10,4),                         -- native units per 1 CAD
  kind          text not null check (kind in ('opening','manual','reconcile')),
  note          text,
  created_at    timestamptz not null default now()
);
create index on public.balance_snapshots (account_id, as_of desc);

-- ───────────────────────────── categories ─────────────────────────────
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  key         text not null,
  parent_id   uuid references public.categories on delete restrict,
  name        text not null,
  kind        text not null check (kind in ('expense','income','transfer','reimbursement')),
  essential   text check (essential in ('fixed','variable')),  -- null = discretionary
  color       text,
  icon        text,                                    -- lucide icon name
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, key),
  check (essential is null or kind = 'expense')
);

create table public.merchants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index on public.merchants (user_id, lower(name));

create table public.rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  priority     int not null default 100,               -- lower runs first
  match_field  text not null default 'description' check (match_field in ('description','merchant')),
  match_type   text not null default 'contains' check (match_type in ('contains','equals','regex')),
  pattern      text not null,
  account_id   uuid references public.accounts on delete cascade,
  min_cents    bigint,
  max_cents    bigint,
  category_id  uuid references public.categories on delete cascade,
  merchant_id  uuid references public.merchants on delete set null,
  is_transfer  boolean not null default false,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ───────────────────────────── transactions ─────────────────────────────
create table public.imports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  file_name      text,
  source         text not null,                        -- scotia_chequing | cibc_costco | cashew | pdf | seed …
  row_count      int not null default 0,
  imported_count int not null default 0,
  skipped_count  int not null default 0,
  status         text not null default 'draft' check (status in ('draft','committed','undone')),
  created_at     timestamptz not null default now()
);

create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  account_id        uuid not null references public.accounts on delete restrict,
  date              date not null,
  posted_date       date,
  amount_cents      bigint not null check (amount_cents <> 0),
  description       text not null default '',          -- raw bank descriptor
  merchant_id       uuid references public.merchants on delete set null,
  category_id       uuid references public.categories on delete set null,
  note              text,
  source            text not null check (source in ('seed','import','manual','chat','mcp')),
  import_id         uuid references public.imports on delete cascade,
  fingerprint       text,                              -- duplicate detection (§4.3)
  in_reports        boolean not null default true,     -- false = balance-only (pre-Aug card rows)
  is_transfer       boolean not null default false,
  transfer_pair_id  uuid references public.transactions on delete set null,
  refund_of_id      uuid references public.transactions on delete set null,
  needs_review      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.transactions (user_id, date desc);
create index on public.transactions (account_id, date);
create index on public.transactions (category_id);
create unique index on public.transactions (account_id, fingerprint) where fingerprint is not null;

create table public.transaction_splits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  transaction_id  uuid not null references public.transactions on delete cascade,
  category_id     uuid references public.categories on delete set null,
  amount_cents    bigint not null check (amount_cents <> 0),
  note            text
);
create index on public.transaction_splits (transaction_id);

-- "Owed by <person>" part of a transaction; excluded from spending, tracked as a receivable.
create table public.shared_debts (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null default auth.uid() references auth.users on delete cascade,
  transaction_id             uuid not null references public.transactions on delete cascade,
  split_id                   uuid references public.transaction_splits on delete cascade,
  person                     text not null,
  amount_cents               bigint not null check (amount_cents > 0),
  settled_at                 date,
  settlement_transaction_id  uuid references public.transactions on delete set null,
  created_at                 timestamptz not null default now()
);

-- ───────────────────────────── planning ─────────────────────────────
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  category_id   uuid not null references public.categories on delete cascade,
  month         date not null check (extract(day from month) = 1),
  amount_cents  bigint not null check (amount_cents >= 0),
  unique (user_id, category_id, month)
);

create table public.income_settings (
  user_id              uuid primary key default auth.uid() references auth.users on delete cascade,
  employer             text,
  net_paycheque_cents  bigint not null check (net_paycheque_cents > 0),
  anchor_payday        date not null,
  frequency_days       int not null default 14,
  holiday_rule         text not null default 'business_day_before'
                         check (holiday_rule in ('business_day_before','business_day_after')),
  updated_at           timestamptz not null default now()
);

create table public.paycheques (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  expected_date  date not null,
  actual_date    date,
  amount_cents   bigint,
  transaction_id uuid references public.transactions on delete set null,
  unique (user_id, expected_date)
);

create table public.savings_goals (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null default auth.uid() references auth.users on delete cascade,
  name                        text not null,
  target_cents                bigint not null check (target_cents > 0),
  monthly_contribution_cents  bigint not null default 0 check (monthly_contribution_cents >= 0),
  account_id                  uuid references public.accounts on delete set null,
  archived                    boolean not null default false,
  created_at                  timestamptz not null default now()
);

-- ───────────────────────────── triggers ─────────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();
create trigger income_settings_touch before update on public.income_settings
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── RLS ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','balance_snapshots','categories','merchants','rules','imports',
    'transactions','transaction_splits','shared_debts','budgets','income_settings',
    'paycheques','savings_goals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ───────────────────────────── views ─────────────────────────────
-- Current balance per account: latest anchor + transactions after its date.
create view public.account_balances with (security_invoker = true) as
select
  a.id            as account_id,
  a.user_id,
  a.key,
  a.name,
  a.account_group,
  a.hidden,
  s.as_of         as anchor_date,
  coalesce(s.amount_cents, 0) + coalesce(t.delta, 0) as balance_cents
from public.accounts a
left join lateral (
  select b.as_of, b.amount_cents
  from public.balance_snapshots b
  where b.account_id = a.id
  order by b.as_of desc, b.created_at desc
  limit 1
) s on true
left join lateral (
  select sum(x.amount_cents) as delta
  from public.transactions x
  where x.account_id = a.id
    and (s.as_of is null or x.date > s.as_of)
) t on true
where not a.archived;

grant select on public.account_balances to authenticated, service_role;
