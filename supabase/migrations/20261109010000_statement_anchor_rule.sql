-- Balance anchors, corrected (Nov 9 2026).
-- A statement/opening anchor ("opening") contains only what was ON that statement.
-- Purchases the owner adds afterwards by hand or through Claude (manual / mcp)
-- count even when dated on or before the statement date: a purchase made Oct 16
-- can post after an Oct 18 statement closes, so it isn't in that balance.
-- A "reconcile"/"manual" anchor is the bank's live total, which already includes
-- everything up to its date, so older entries stay absorbed there.
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
      or (s.kind = 'opening' and x.source in ('manual', 'mcp') and x.created_at > s.created_at)
    )
) t on true
left join lateral (
  select sum(x.amount_cents) as paid
  from public.transactions x
  where x.pays_account_id = a.id
    and (
      s.as_of is null
      or x.date > s.as_of
      or (s.kind = 'opening' and x.source in ('manual', 'mcp') and x.created_at > s.created_at)
    )
) p on true
where not a.archived;
