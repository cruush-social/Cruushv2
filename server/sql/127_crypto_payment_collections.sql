-- Signed transactions are persisted before broadcast for restart-safe automatic collection.
-- This table contains no signing keys. Access belongs to the separate forwarding service.
create table if not exists crypto_payment_collections (
  intent_id uuid primary key references crypto_payment_intents(id) on delete restrict,
  status text not null check (status in ('waiting', 'signed', 'broadcast', 'confirmed')),
  signed_bundle jsonb,
  last_error_code text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('signed', 'broadcast', 'confirmed') or signed_bundle is not null)
);
