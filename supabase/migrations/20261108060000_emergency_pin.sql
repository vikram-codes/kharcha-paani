-- Emergency fund PIN (owner, Nov 8 2026): the amount stays hidden until the PIN
-- is entered. Stored as a salted scrypt hash; repeated wrong PINs lock it briefly.
alter table public.profiles
  add column emergency_pin_hash text,
  add column pin_failed_count int not null default 0,
  add column pin_locked_until timestamptz;
