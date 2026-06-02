create table if not exists encrypted_relationship_records (
  id uuid primary key default gen_random_uuid(),
  record_lookup_index text not null,
  actor_user_index text,
  target_user_index text,
  ordered_pair_index text,
  participant_one_index text,
  participant_two_index text,
  relationship_type_index text not null,
  relationship_status_index text not null,
  dedupe_bucket_index text,
  record_ciphertext text not null,
  record_nonce text not null,
  record_auth_tag text not null,
  encryption_key_version text not null,
  index_key_version text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_lookup_index, index_key_version)
);

create index if not exists encrypted_relationship_records_actor_idx
  on encrypted_relationship_records (
    actor_user_index,
    relationship_type_index,
    relationship_status_index,
    index_key_version,
    created_at desc
  );

create index if not exists encrypted_relationship_records_target_idx
  on encrypted_relationship_records (
    target_user_index,
    relationship_type_index,
    relationship_status_index,
    index_key_version,
    created_at desc
  );

create index if not exists encrypted_relationship_records_pair_idx
  on encrypted_relationship_records (
    ordered_pair_index,
    relationship_type_index,
    relationship_status_index,
    index_key_version
  );

create index if not exists encrypted_relationship_records_participant_one_idx
  on encrypted_relationship_records (
    participant_one_index,
    relationship_type_index,
    relationship_status_index,
    index_key_version,
    created_at desc
  );

create index if not exists encrypted_relationship_records_participant_two_idx
  on encrypted_relationship_records (
    participant_two_index,
    relationship_type_index,
    relationship_status_index,
    index_key_version,
    created_at desc
  );

create index if not exists encrypted_relationship_records_dedupe_idx
  on encrypted_relationship_records (
    dedupe_bucket_index,
    relationship_type_index,
    relationship_status_index,
    index_key_version
  )
  where dedupe_bucket_index is not null;

create table if not exists encrypted_relationship_tokens (
  id uuid primary key default gen_random_uuid(),
  relationship_record_id uuid not null references encrypted_relationship_records(id) on delete cascade,
  purpose_index text not null,
  token_lookup_index text not null,
  token_ciphertext text not null,
  token_nonce text not null,
  token_auth_tag text not null,
  token_signature text not null,
  token_key_version text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (token_lookup_index, token_key_version)
);

create index if not exists encrypted_relationship_tokens_record_purpose_idx
  on encrypted_relationship_tokens (
    relationship_record_id,
    purpose_index,
    expires_at
  )
  where revoked_at is null;
