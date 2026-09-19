-- Native Bitcoin is separate from ERC-20 evidence and cannot settle an EVM order.
alter table crypto_payment_intents drop constraint if exists crypto_payment_intents_asset_check;
alter table crypto_payment_intents add constraint crypto_payment_intents_asset_check check (asset in ('USDC', 'PYUSD', 'BTC'));
alter table crypto_payment_intents drop constraint if exists crypto_payment_intents_network_check;
alter table crypto_payment_intents add constraint crypto_payment_intents_network_check check (network in ('base', 'ethereum', 'arbitrum', 'base-sepolia', 'bitcoin'));
alter table crypto_payment_intents drop constraint if exists crypto_payment_intents_payment_address_check;
alter table crypto_payment_intents add constraint crypto_payment_intents_payment_address_check check (
  payment_address is null or
  (asset = 'BTC' and network = 'bitcoin' and payment_address ~ '^bc1q[023456789acdefghjklmnpqrstuvwxyz]{38}$') or
  (asset in ('USDC', 'PYUSD') and network <> 'bitcoin' and payment_address ~ '^0x[0-9A-Fa-f]{40}$')
);
create table if not exists crypto_bitcoin_transfers (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references crypto_payment_intents(id) on delete cascade,
  transaction_hash text not null check (transaction_hash ~ '^[a-f0-9]{64}$'),
  output_index integer not null check (output_index >= 0),
  to_address text not null,
  amount_atomic numeric(16,0) not null check (amount_atomic > 0 and amount_atomic <= 2100000000000000),
  block_number bigint,
  block_hash text,
  block_timestamp timestamptz,
  confirmations integer not null default 0 check (confirmations >= 0),
  status text not null check (status in ('observed', 'confirmed', 'reorganized')),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_hash, output_index)
);
create index if not exists crypto_bitcoin_transfers_intent_idx on crypto_bitcoin_transfers(intent_id, status);
