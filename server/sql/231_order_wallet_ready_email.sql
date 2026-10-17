-- New allocations only: no backfill or emails for historical orders.
create table if not exists order_wallet_ready_emails (
  intent_id uuid primary key references crypto_payment_intents(id) on delete cascade,
  claimed_until timestamptz not null default now(),
  claim_token uuid,
  first_attempt_at timestamptz,
  delivery_hash text,
  sent_at timestamptz,
  provider_message_id text,
  reconciliation_required boolean not null default false
);
create index if not exists order_wallet_ready_emails_pending_idx
  on order_wallet_ready_emails(claimed_until) where sent_at is null and not reconciliation_required;
