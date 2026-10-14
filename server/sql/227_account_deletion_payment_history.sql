-- Collections persist signed transactions for restart-safe forwarding. An
-- account deletion must unlink its payment history without cascading into
-- those records or discarding the transfer evidence used for reconciliation.
alter table crypto_payment_intents
  alter column user_id drop not null;

alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_user_id_fkey;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_user_id_fkey
  foreign key (user_id) references app_users(id) on delete set null;
