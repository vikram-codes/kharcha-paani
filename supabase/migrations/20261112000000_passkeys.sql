-- Face ID unlock (Nov 12 2026): a passkey per device. Only the public key is
-- stored; the private key stays in the iPhone's Secure Enclave and Face ID
-- unlocks it. Each unlock signs a one-time challenge kept on the profile.
create table public.passkeys (
  id            text primary key,              -- credential id (base64url)
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  public_key    text not null,                 -- COSE public key (base64url)
  counter       bigint not null default 0,
  transports    text[],
  device        text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
alter table public.passkeys enable row level security;
create policy owner_all on public.passkeys for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.passkeys to authenticated;
grant all on public.passkeys to service_role;

alter table public.profiles
  add column webauthn_challenge text,
  add column webauthn_challenge_at timestamptz;
