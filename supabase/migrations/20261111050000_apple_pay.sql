-- Apple Pay → Kharcha-Paani (#9, Nov 11 2026). An iOS Shortcuts "Transaction"
-- automation sends each tap-to-pay purchase (amount, merchant, Wallet card) to
-- a private add-only link, and it's saved straight away.

-- 1. A transaction's source can be "applepay".
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.transactions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%source%'
  loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;
end $$;
alter table public.transactions
  add constraint transactions_source_check check (source in ('seed','import','manual','chat','mcp','applepay'));

-- 2. Links are either the Claude connector (full access, drafts) or Apple Pay (can only add purchases).
alter table public.api_tokens
  add column scope text not null default 'mcp' check (scope in ('mcp','applepay'));

-- 3. Which account each Apple Wallet card is ("Scene+ Visa" → Scotiabank Scene+ Visa).
create table public.wallet_cards (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  wallet_name  text not null,
  account_id   uuid not null references public.accounts on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, wallet_name)
);
alter table public.wallet_cards enable row level security;
create policy owner_all on public.wallet_cards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.wallet_cards to authenticated;
grant all on public.wallet_cards to service_role;

-- 4. The "Added $5.42 · Tim Hortons" notification can be switched off.
alter table public.profiles add column notify_applepay boolean not null default true;

-- 5. Balances: Apple Pay purchases count like ones you add yourself (after a
--    statement or a same-day balance update).
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
  select b.as_of, b.amount_cents, b.kind, b.created_at
  from public.balance_snapshots b
  where b.account_id = a.id
  order by b.as_of desc, b.created_at desc
  limit 1
) s on true
left join lateral (
  select sum(x.amount_cents) as delta
  from public.transactions x
  where x.account_id = a.id
    and (
      s.as_of is null
      or x.date > s.as_of
      or (
        x.source in ('manual', 'mcp', 'applepay')
        and x.created_at > s.created_at
        and (s.kind = 'opening' or x.date = s.as_of)
      )
    )
) t on true
left join lateral (
  select sum(x.amount_cents) as paid
  from public.transactions x
  where x.pays_account_id = a.id
    and (
      s.as_of is null
      or x.date > s.as_of
      or (
        x.source in ('manual', 'mcp', 'applepay')
        and x.created_at > s.created_at
        and (s.kind = 'opening' or x.date = s.as_of)
      )
    )
) p on true
where not a.archived;
