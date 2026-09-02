-- Crypto payment intents.
create table if not exists crypto_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  plan_id text not null,
  processor text not null default 'in_house' check (processor = 'in_house'),
  asset text not null default 'USDC' check (asset = 'USDC'),
  network text not null default 'base' check (network = 'base'),
  amount_usd_cents integer not null check (amount_usd_cents > 0),
  quoted_amount_atomic text check (
    quoted_amount_atomic is null or quoted_amount_atomic ~ '^[0-9]+$'
  ),
  derivation_index bigint generated always as identity check (
    derivation_index >= 1 and derivation_index <= 2147483647
  ),
  wallet_xpub_fingerprint text not null check (wallet_xpub_fingerprint ~ '^[a-f0-9]{64}$'),
  payment_address text check (
    payment_address is null or payment_address ~ '^0x[0-9A-Fa-f]{40}$'
  ),
  status text not null default 'pending' check (status in (
    'pending',
    'awaiting_payment',
    'confirming',
    'paid',
    'expired',
    'failed',
    'cancelled',
    'refunded'
  )),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (derivation_index),
  unique (user_id, idempotency_key)
);

create unique index if not exists crypto_payment_intents_payment_address_idx
  on crypto_payment_intents (lower(payment_address))
  where payment_address is not null;

create index if not exists crypto_payment_intents_user_created_idx
  on crypto_payment_intents (user_id, created_at desc);

create index if not exists crypto_payment_intents_status_expiry_idx
  on crypto_payment_intents (status, expires_at);

create table if not exists crypto_payment_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'base' check (source = 'base'),
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  payload_sha256 text not null,
  processing_status text not null default 'received' check (processing_status in (
    'received',
    'processed',
    'ignored',
    'failed'
  )),
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source, external_event_id)
);

create index if not exists crypto_payment_events_received_idx
  on crypto_payment_events (received_at desc);
