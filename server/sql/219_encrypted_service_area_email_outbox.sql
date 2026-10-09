-- Expand only. migrate.ts locks, encrypts and verifies legacy rows before
-- dropping either old queue, all within this migration's transaction.
create table if not exists service_area_email_outbox (
  event_id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  dedupe_token text not null unique check (dedupe_token ~ '^[0-9a-f]{64}$'),
  payload_ciphertext text not null,
  payload_nonce text not null,
  payload_auth_tag text not null,
  wrapped_payload_dek text not null,
  payload_dek_nonce text not null,
  payload_dek_auth_tag text not null,
  payload_key_version text not null,
  queued_at timestamptz not null default now(),
  claim_token uuid,
  claimed_until timestamptz,
  email_started_at timestamptz,
  email_sent_at timestamptz,
  cancelled_at timestamptz,
  reconciliation_required_at timestamptz
);

create index if not exists service_area_email_outbox_pending_idx
  on service_area_email_outbox (coalesce(claimed_until, queued_at), queued_at, event_id)
  where email_sent_at is null and reconciliation_required_at is null and cancelled_at is null;
create index if not exists service_area_email_outbox_user_idx
  on service_area_email_outbox (user_id);
