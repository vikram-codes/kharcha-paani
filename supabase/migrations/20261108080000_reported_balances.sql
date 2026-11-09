-- The balance the owner read off their banking app (e.g. Nov 7, 2026). Cards are
-- anchored to their last statement; the app shows "still to add" = reported − computed
-- until the missing transactions are entered.
alter table public.accounts
  add column reported_balance_cents bigint,
  add column reported_on date;
