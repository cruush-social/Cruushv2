-- Preserve the address-allocation history completed before the production
-- Bitcoin cutover. Indices 1 through 12 have already been issued from the
-- configured receive descriptor outside the production ledger. Production
-- must therefore begin at 13 even when its own order table is still empty.
--
-- Migrations replay on every boot, so this may only move the sequence forward.
do $crypto_payment_allocator_history_floor$
declare
  allocator_last_value bigint;
  saved_maximum bigint;
begin
  if to_regclass('public.crypto_payment_intents') is null
    or to_regclass('public.crypto_payment_intents_derivation_index_seq') is null then
    return;
  end if;

  select last_value
    into allocator_last_value
    from crypto_payment_intents_derivation_index_seq;

  select coalesce(max(derivation_index), 0)
    into saved_maximum
    from crypto_payment_intents;

  perform setval(
    'crypto_payment_intents_derivation_index_seq',
    greatest(allocator_last_value, saved_maximum, 12),
    true
  );
end
$crypto_payment_allocator_history_floor$;
