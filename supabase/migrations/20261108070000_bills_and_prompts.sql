-- Prompts and suggestions the owner has handled or dismissed (keyed, so each shows once):
-- "third-pay:2026-12", "month-end:2026-11", "bill:<merchant key>".
create table public.dismissals (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  key         text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.dismissals enable row level security;
create policy owner_all on public.dismissals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.dismissals to authenticated;
grant all on public.dismissals to service_role;

-- Which merchant a bill tracks (for detection and matching).
alter table public.recurring_series add column merchant_key text;
