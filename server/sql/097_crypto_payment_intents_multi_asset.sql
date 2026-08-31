alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_asset_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_asset_check
  check (asset in ('USDC', 'PYUSD'));

-- The network and source checks are widened again by 099. Recreating them
-- here unconditionally would fail a replay against a database that already
-- holds rows on the networks 099 allows, so this migration only performs the
-- 096-to-097 widening when the constraint has not yet moved past 096.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crypto_payment_intents_network_check'
      and pg_get_constraintdef(oid) like '%ethereum%'
  ) then
    alter table crypto_payment_intents
      drop constraint if exists crypto_payment_intents_network_check;

    alter table crypto_payment_intents
      add constraint crypto_payment_intents_network_check
      check (network in ('base', 'ethereum'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'crypto_payment_events_source_check'
      and pg_get_constraintdef(oid) like '%ethereum%'
  ) then
    alter table crypto_payment_events
      drop constraint if exists crypto_payment_events_source_check;

    alter table crypto_payment_events
      add constraint crypto_payment_events_source_check
      check (source in ('base', 'ethereum'));
  end if;
end $$;
