-- Loans in another currency (the student loan, in INR): what was borrowed and the
-- EMI, both in the loan's own currency, so the app can show interest charged to
-- date = owed now − borrowed + repaid.
alter table public.accounts
  add column borrowed_native bigint check (borrowed_native is null or borrowed_native > 0),
  add column emi_native bigint check (emi_native is null or emi_native > 0);
