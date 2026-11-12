-- Backups (Nov 11 2026): when the last weekly backup email went out and when
-- you last exported from Settings, so the app can warn if backups stop.
alter table public.profiles
  add column last_backup_emailed_at timestamptz,
  add column last_export_at timestamptz;
