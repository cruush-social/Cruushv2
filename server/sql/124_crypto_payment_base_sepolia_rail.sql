-- Allows the Base Sepolia test network so settlement can be proven end to end
-- without spending money: faucet USDC and faucet gas are both free.
--
-- Widening this constraint is deliberately not the thing that makes a testnet
-- payment spendable. Base Sepolia tokens are worthless, so the rail is offered
-- only when CRYPTO_PROCESSOR_TESTNET_ENABLED is set, and configuration
-- validation refuses that flag in production. This migration exists so a
-- development or staging database can store the rows those test payments
-- create; it grants nothing on its own.

alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_network_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_network_check
  check (network in ('base', 'ethereum', 'arbitrum', 'base-sepolia', 'bitcoin'));

alter table crypto_payment_events
  drop constraint if exists crypto_payment_events_source_check;

alter table crypto_payment_events
  add constraint crypto_payment_events_source_check
  check (source in ('base', 'ethereum', 'arbitrum', 'base-sepolia'));
