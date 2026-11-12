-- Offline quick add (Nov 11 2026): an entry saved on the phone without signal
-- carries a random id made on the phone. When it syncs, the id makes the save
-- safe to repeat: if the first attempt reached the server but the reply was
-- lost, the retry finds the same id and doesn't add the purchase twice.
alter table public.transactions add column client_id uuid;

create unique index transactions_client_id_key
  on public.transactions (user_id, client_id)
  where client_id is not null;
