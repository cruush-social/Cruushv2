alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_asset_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_asset_check
  check (asset in ('USDC', 'PYUSD'));

alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_network_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_network_check
  check (network in ('base', 'ethereum'));

alter table crypto_payment_events
  drop constraint if exists crypto_payment_events_source_check;

alter table crypto_payment_events
  add constraint crypto_payment_events_source_check
  check (source in ('base', 'ethereum'));
