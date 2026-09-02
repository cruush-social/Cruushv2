-- Settlement evidence for the in-house crypto processor.
--
-- Every row in crypto_payment_transfers is one ERC-20 Transfer log observed on
-- chain and attributed to one payment intent. Chain evidence is the only thing
-- that may move an intent to 'paid'; a browser, a copied address, or a
-- member-supplied transaction hash never can.

create table if not exists crypto_payment_transfers (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references crypto_payment_intents(id) on delete cascade,
  chain_id integer not null check (chain_id > 0),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  token_address text not null check (token_address ~ '^0x[0-9A-Fa-f]{40}$'),
  from_address text not null check (from_address ~ '^0x[0-9A-Fa-f]{40}$'),
  to_address text not null check (to_address ~ '^0x[0-9A-Fa-f]{40}$'),
  amount_atomic text not null check (amount_atomic ~ '^[0-9]+$'),
  confirmations integer not null default 0 check (confirmations >= 0),
  -- 'observed' means seen but not yet confirmed to the configured target.
  -- 'confirmed' means it counts toward settlement.
  -- 'reorganized' means the chain dropped it; it must stop counting and must
  -- never be deleted, so support can still explain what happened.
  status text not null default 'observed' check (status in (
    'observed',
    'confirmed',
    'reorganized'
  )),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  -- One chain log is one row, forever. This is the deduplication boundary:
  -- a watcher that re-reads the same block range cannot double-count.
  unique (chain_id, transaction_hash, log_index)
);

create index if not exists crypto_payment_transfers_intent_idx
  on crypto_payment_transfers (intent_id, status);

create index if not exists crypto_payment_transfers_block_idx
  on crypto_payment_transfers (chain_id, block_number);

-- How far the watcher has read on each chain. One row per chain.
create table if not exists crypto_chain_watch_cursors (
  chain_id integer primary key check (chain_id > 0),
  last_scanned_block bigint not null check (last_scanned_block >= 0),
  last_scanned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Settlement bookkeeping on the intent itself.
alter table crypto_payment_intents
  add column if not exists confirmed_amount_atomic text
    check (confirmed_amount_atomic is null or confirmed_amount_atomic ~ '^[0-9]+$');

alter table crypto_payment_intents
  add column if not exists settlement_note text;

-- Set when the entitlement has actually been granted for this intent, so the
-- grant can be made idempotent at the database boundary rather than in code.
alter table crypto_payment_intents
  add column if not exists entitlement_granted_at timestamptz;

-- A paid intent must always carry the confirmed amount that paid for it, so
-- reconciliation can prove why access exists.
alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_paid_has_amount_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_paid_has_amount_check
  check (status <> 'paid' or confirmed_amount_atomic is not null);

-- An entitlement may only be recorded against an intent that actually reached
-- 'paid'. This is the last line of defence against a grant from any other path.
alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_grant_requires_paid_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_grant_requires_paid_check
  check (entitlement_granted_at is null or status in ('paid', 'refunded'));

create index if not exists crypto_payment_intents_watchable_idx
  on crypto_payment_intents (status, payment_address)
  where status in ('awaiting_payment', 'confirming');

-- Paid access records carry the crypto intent that paid for them, so
-- reconciliation can always prove why a member has access. The existing
-- checkout_session_id stays exactly as it is for card and test checkouts;
-- these columns are additive and null for those paths.
alter table cruush_plus_subscriptions
  add column if not exists crypto_payment_intent_id uuid
    references crypto_payment_intents(id) on delete set null;

alter table cruush_plus_lifetime_access
  add column if not exists crypto_payment_intent_id uuid
    references crypto_payment_intents(id) on delete set null;

alter table founder_redemptions
  add column if not exists crypto_payment_intent_id uuid
    references crypto_payment_intents(id) on delete set null;

-- One intent can pay for at most one subscription and one lifetime grant.
-- Replay of the grant path therefore cannot create a second period.
create unique index if not exists cruush_plus_subscriptions_crypto_intent_uidx
  on cruush_plus_subscriptions (crypto_payment_intent_id)
  where crypto_payment_intent_id is not null;

create unique index if not exists cruush_plus_lifetime_crypto_intent_uidx
  on cruush_plus_lifetime_access (crypto_payment_intent_id)
  where crypto_payment_intent_id is not null;
