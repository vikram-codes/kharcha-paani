-- Statement checklist (#5, Nov 11 2026): which account an import was for and
-- the date its statement closed, so Claude can tell when the next one is out.
alter table public.imports
  add column account_id uuid references public.accounts on delete set null,
  add column period_end date;
