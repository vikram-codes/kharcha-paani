-- Quick-add remembers the account used last (owner: "always use the last used option").
alter table public.profiles add column last_account_id uuid references public.accounts on delete set null;
