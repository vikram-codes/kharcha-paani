-- Phone reminders (#3, Nov 11 2026): web push.
-- push_subscriptions: each device that turned notifications on (an endpoint at
--   Apple's / Google's push service, plus the keys to encrypt messages for it).
-- notification_log: every reminder sent, by a stable key (e.g. "bill:<id>:2026-12-01:due"),
--   so none is ever sent twice.
-- profiles.notify_*: which kinds you want. All on by default.
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  device        text,
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz,
  unique (user_id, endpoint)
);

create table public.notification_log (
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  key      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, key)
);

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions','notification_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

alter table public.profiles
  add column notify_bills   boolean not null default true,
  add column notify_payday  boolean not null default true,
  add column notify_budget  boolean not null default true,
  add column notify_catchup boolean not null default true;
