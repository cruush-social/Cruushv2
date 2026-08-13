alter table support_requests
  drop constraint if exists support_requests_category_check;

alter table support_requests
  add constraint support_requests_category_check
  check (category in ('bug', 'comment', 'question', 'policy', 'suspension_appeal'));

create table if not exists suspension_appeal_evidence (
  id uuid primary key default gen_random_uuid(),
  support_request_id uuid not null references support_requests(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('id', 'selfie')),
  object_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 5242880),
  encrypted_data_key text not null,
  data_key_nonce text not null,
  data_key_auth_tag text not null,
  content_nonce text not null,
  content_auth_tag text not null,
  key_version text not null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (support_request_id, evidence_type)
);

create index if not exists idx_suspension_appeal_evidence_expiry
  on suspension_appeal_evidence (expires_at)
  where deleted_at is null;

create index if not exists idx_suspension_appeal_evidence_request
  on suspension_appeal_evidence (support_request_id)
  where deleted_at is null;
