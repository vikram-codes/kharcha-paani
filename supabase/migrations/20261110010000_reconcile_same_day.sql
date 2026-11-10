-- Same-day entries after a balance update (Nov 10 2026).
-- A "reconcile" anchor is the bank's live total when you updated it, so it
-- absorbs everything dated before that day. But something added by hand or
-- through Claude later the SAME day (the coffee after you updated chequing in
-- the morning) happened after the update and must still count.
-- Statement anchors ("opening") keep their rule: anything added by hand after
-- them counts, whatever its date.
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
        x.source in ('manual', 'mcp')
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
        x.source in ('manual', 'mcp')
        and x.created_at > s.created_at
        and (s.kind = 'opening' or x.date = s.as_of)
      )
    )
) p on true
where not a.archived;
