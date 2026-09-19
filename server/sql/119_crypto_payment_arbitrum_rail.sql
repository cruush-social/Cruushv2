-- Adds Arbitrum One as a receiving network.
--
-- Arbitrum is the only chain that Cash App, Venmo, and PayPal can all send to,
-- and its fees are a rounding error next to Ethereum mainnet. That matters more
-- than it looks: collecting a payment costs two transactions per order, one to
-- fund the derived address with gas and one to sweep it to the treasury, so a
-- mainnet rail charges a fee on every single sale forever.

alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_network_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_network_check
  check (network in ('base', 'ethereum', 'arbitrum'));

alter table crypto_payment_events
  drop constraint if exists crypto_payment_events_source_check;

alter table crypto_payment_events
  add constraint crypto_payment_events_source_check
  check (source in ('base', 'ethereum', 'arbitrum'));
