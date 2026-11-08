-- Reporting month vs payment date (owner, Nov 8 2026): rent and similar payments
-- count in the month they're FOR, not the month they were sent. `date` stays the
-- real payment date; summaries and budgets use report_on = coalesce(report_date, date).
alter table public.transactions add column report_date date;
alter table public.transaction_splits add column report_date date;

-- Money a friend owes that isn't tied to one transaction (e.g. "$340 for food, split unknown").
alter table public.shared_debts alter column transaction_id drop not null;
alter table public.shared_debts add column note text;

-- One row per reportable line: a whole transaction, or each split line of it.
create view public.ledger_lines with (security_invoker = true) as
select
  t.id                                   as line_id,
  t.id                                   as transaction_id,
  t.user_id,
  t.account_id,
  t.date,
  coalesce(t.report_date, t.date)        as report_on,
  t.amount_cents,
  t.category_id,
  t.description,
  t.note,
  t.is_transfer,
  t.in_reports,
  false                                  as is_split
from public.transactions t
where not exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
union all
select
  s.id,
  t.id,
  t.user_id,
  t.account_id,
  t.date,
  coalesce(s.report_date, t.report_date, t.date),
  s.amount_cents,
  s.category_id,
  t.description,
  coalesce(s.note, t.note),
  t.is_transfer,
  t.in_reports,
  true
from public.transaction_splits s
join public.transactions t on t.id = s.transaction_id;

grant select on public.ledger_lines to authenticated, service_role;
