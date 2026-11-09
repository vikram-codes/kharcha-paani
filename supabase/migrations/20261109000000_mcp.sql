-- MCP connection (§7.11, phase 8): Claude connects with a private connector link.
-- The token in the link is stored only as a SHA-256 hash and can be revoked.
create table public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  name          text not null,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- Writes from Claude are drafts first; they're saved only after the owner says yes (confirm).
create table public.mcp_drafts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  payload       jsonb not null,
  summary       text not null,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  discarded_at  timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['api_tokens','mcp_drafts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
