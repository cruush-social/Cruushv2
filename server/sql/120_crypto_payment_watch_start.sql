-- Gives every issued payment address a durable chain origin. The watcher can
-- restart without a cursor and resume from the oldest address's exact start
-- block instead of guessing from chain speed or silently skipping a payment.
--
-- The column stays nullable for mixed-version safety. New writers populate it
-- before an address becomes fillable. Existing address rows are conservatively
-- backfilled to block zero once; their cursors are cleared in the same initial
-- migration so no legacy transfer can remain behind an already-advanced cursor.

do $$
begin
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'crypto_payment_intents'::regclass
      and attname = 'watch_start_block'
      and not attisdropped
  ) then
    alter table crypto_payment_intents
      add column watch_start_block bigint
        check (watch_start_block is null or watch_start_block >= 0);

    update crypto_payment_intents
    set watch_start_block = 0
    where payment_address is not null;

    delete from crypto_chain_watch_cursors
    where exists (
      select 1
      from crypto_payment_intents
      where payment_address is not null
    );
  end if;
end
$$;
