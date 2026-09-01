-- Durable per-intent positions for every supported payment chain.
--
-- One global chain cursor is not enough: a new address can appear after that
-- cursor advanced, and a wrong-chain endpoint can be unavailable when the
-- address is issued. Each intent therefore keeps its own chain origin and
-- cursor. New addresses use verified pre-publication heads for every configured
-- chain. An unconfigured wrong-chain origin stays conservatively at block zero;
-- the watcher never guesses a later origin after publication.

create table if not exists crypto_payment_watch_positions (
  intent_id uuid not null references crypto_payment_intents(id) on delete cascade,
  chain_id integer not null check (chain_id > 0),
  watch_start_block bigint not null check (watch_start_block >= 0),
  last_scanned_block bigint check (
    last_scanned_block is null or last_scanned_block >= watch_start_block
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (intent_id, chain_id)
);

create index if not exists crypto_payment_watch_positions_chain_cursor_idx
  on crypto_payment_watch_positions (chain_id, last_scanned_block);

-- Existing addresses predate per-chain origins. The only lossless origin on a
-- non-intended chain is block zero. The intended chain retains migration 100's
-- exact origin. Cursors stay null so the first pass proves every retained row.
insert into crypto_payment_watch_positions (
  intent_id,
  chain_id,
  watch_start_block,
  last_scanned_block
)
select
  intent.id,
  chain.chain_id,
  case
    when chain.chain_id = case intent.network
      when 'ethereum' then 1
      when 'arbitrum' then 42161
      when 'base' then 8453
      else null
    end then coalesce(intent.watch_start_block, 0)
    else 0
  end,
  null
from crypto_payment_intents intent
cross join (values (1), (42161), (8453)) as chain(chain_id)
where intent.payment_address is not null
on conflict (intent_id, chain_id) do nothing;

-- A transfer's chain timestamp decides whether it arrived before checkout
-- expiry. The watcher backfills this on the next authoritative re-read. Null
-- legacy values never count toward an automatic grant.
alter table crypto_payment_transfers
  add column if not exists block_timestamp timestamptz;

comment on column crypto_payment_transfers.block_timestamp is
  'Authoritative timestamp returned by eth_getBlockByNumber for the transfer block.';
