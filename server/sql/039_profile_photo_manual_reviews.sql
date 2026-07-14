create table if not exists profile_photo_manual_reviews (
  id uuid primary key,
  owner_user_id uuid not null references app_users(id) on delete cascade,
  media_id uuid not null unique,
  content_review_id uuid not null unique references content_reviews(id) on delete cascade,
  object_key text unique,
  public_url text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0),
  encrypted_data_key text,
  data_key_nonce text,
  data_key_auth_tag text,
  content_nonce text,
  content_auth_tag text,
  key_version text,
  photodna_status text not null,
  photodna_provider_request_id text,
  status text not null check (status in ('pending', 'deleting', 'approved', 'rejected', 'expired')),
  deletion_outcome text check (deletion_outcome in ('rejected', 'expired')),
  expires_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 128),
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  ciphertext_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status in ('pending', 'deleting')
    or (
      object_key is null
      and encrypted_data_key is null
      and data_key_nonce is null
      and data_key_auth_tag is null
      and content_nonce is null
      and content_auth_tag is null
      and key_version is null
    )
  )
);

create unique index if not exists idx_profile_photo_manual_reviews_one_active_per_owner
  on profile_photo_manual_reviews (owner_user_id)
  where status in ('pending', 'deleting');

create index if not exists idx_profile_photo_manual_reviews_cleanup
  on profile_photo_manual_reviews (status, expires_at, updated_at)
  where status in ('pending', 'deleting');

revoke all on profile_photo_manual_reviews from public;
