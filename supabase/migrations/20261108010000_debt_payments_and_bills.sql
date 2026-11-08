-- Debt payments that are also spending (Affirm, student loan): the chequing
-- transaction stays in its expense category AND reduces the linked debt.
alter table public.transactions
  add column pays_account_id uuid references public.accounts on delete set null;
create index on public.transactions (pays_account_id) where pays_account_id is not null;

-- Known upcoming payments (§6, §7.7). Phase 6 adds detection; for now they're entered.
create table public.recurring_series (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  name             text not null,
  note             text,
  account_id       uuid references public.accounts on delete set null,   -- pays from
  pays_account_id  uuid references public.accounts on delete set null,   -- debt it reduces
  category_id      uuid references public.categories on delete set null,
  amount_cents     bigint not null check (amount_cents <> 0),            -- negative = out
  cadence          text not null check (cadence in ('once','monthly')),
  next_date        date not null,
  end_date         date,
  confirmed        boolean not null default true,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.recurring_series enable row level security;
create policy owner_all on public.recurring_series for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.recurring_series to authenticated;
grant all on public.recurring_series to service_role;

-- Balance = latest anchor + own transactions after it + payments made towards it after it.
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id            as account_id,
  a.user_id,
  a.key,
  a.name,
  a.account_group,
  a.hidden,
  s.as_of         as anchor_date,
  coalesce(s.amount_cents, 0) + coalesce(t.delta, 0) - coalesce(p.paid, 0) as balance_cents
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
left join lateral (
  select sum(x.amount_cents) as paid           -- negative (money out), so subtracting reduces the debt
  from public.transactions x
  where x.pays_account_id = a.id
    and (s.as_of is null or x.date > s.as_of)
) p on true
where not a.archived;
