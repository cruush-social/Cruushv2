create table if not exists encrypted_location_envelopes (
  subject_user_id uuid primary key references profiles(id) on delete cascade,
  location_version bigint not null,
  location_ciphertext text not null,
  location_nonce text not null,
  location_auth_tag text not null,
  wrapped_location_dek text not null,
  location_dek_nonce text not null,
  location_dek_auth_tag text not null,
  key_version text not null,
  coarse_index_tokens text[] not null,
  collected_at_ms bigint not null,
  expires_at_ms bigint not null,
  updated_at timestamptz not null default now()
);

create index if not exists encrypted_location_envelopes_coarse_idx
  on encrypted_location_envelopes using gin (coarse_index_tokens);

create index if not exists encrypted_location_envelopes_expires_idx
  on encrypted_location_envelopes (expires_at_ms);

create table if not exists encrypted_visibility_tokens (
  subject_user_id uuid primary key references profiles(id) on delete cascade,
  policy_version bigint not null,
  policy_ciphertext text not null,
  policy_nonce text not null,
  policy_auth_tag text not null,
  wrapped_policy_dek text not null,
  policy_dek_nonce text not null,
  policy_dek_auth_tag text not null,
  key_version text not null,
  updated_at_ms bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists ghost_rotation_tokens (
  subject_user_id uuid not null references profiles(id) on delete cascade,
  rotation_epoch bigint not null,
  policy_version bigint not null,
  token_ciphertext text not null,
  token_nonce text not null,
  token_auth_tag text not null,
  wrapped_token_dek text not null,
  token_dek_nonce text not null,
  token_dek_auth_tag text not null,
  key_version text not null,
  created_at_ms bigint not null,
  expires_at_ms bigint not null,
  revoked_at_ms bigint,
  created_at timestamptz not null default now(),
  primary key (subject_user_id, rotation_epoch, policy_version)
);

create index if not exists ghost_rotation_tokens_active_idx
  on ghost_rotation_tokens (subject_user_id, rotation_epoch, policy_version, expires_at_ms)
  where revoked_at_ms is null;

create table if not exists encrypted_privacy_audit_events (
  id uuid primary key default gen_random_uuid(),
  permission_lookup_index text not null unique,
  subject_user_index text not null,
  viewer_user_index text not null,
  event_type_index text not null,
  status_index text not null,
  event_ciphertext text not null,
  event_nonce text not null,
  event_auth_tag text not null,
  wrapped_event_dek text not null,
  event_dek_nonce text not null,
  event_dek_auth_tag text not null,
  key_version text not null,
  created_at_ms bigint not null,
  revoked_at_ms bigint,
  created_at timestamptz not null default now()
);

create index if not exists encrypted_privacy_audit_events_subject_idx
  on encrypted_privacy_audit_events (
    subject_user_index,
    event_type_index,
    status_index,
    created_at_ms desc
  );

create index if not exists encrypted_privacy_audit_events_viewer_idx
  on encrypted_privacy_audit_events (
    viewer_user_index,
    event_type_index,
    status_index,
    created_at_ms desc
  );
