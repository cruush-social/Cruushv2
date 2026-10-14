-- Provider cleanup must survive account removal and process restarts. The
-- target is encrypted only while erasure remains pending; terminal rows retain
-- no email, account ID, payload ciphertext or decrypting material.
create table if not exists resend_contact_deletion_outbox (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'completed', 'superseded')),
  payload_ciphertext text,
  payload_nonce text,
  payload_auth_tag text,
  encrypted_data_key text,
  data_key_nonce text,
  data_key_auth_tag text,
  key_version text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  last_error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint resend_contact_deletion_payload_state check (
    (status = 'pending' and payload_ciphertext is not null and payload_nonce is not null
      and payload_auth_tag is not null and encrypted_data_key is not null
      and data_key_nonce is not null and data_key_auth_tag is not null and key_version is not null)
    or
    (status <> 'pending' and payload_ciphertext is null and payload_nonce is null
      and payload_auth_tag is null and encrypted_data_key is null
      and data_key_nonce is null and data_key_auth_tag is null and key_version is null)
  )
);

create index if not exists resend_contact_deletion_pending_idx
  on resend_contact_deletion_outbox (next_attempt_at, created_at)
  where status = 'pending';
