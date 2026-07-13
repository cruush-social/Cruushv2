create table if not exists moderation_media_grants (
  id uuid primary key,
  owner_user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  object_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0),
  encrypted_data_key text not null,
  data_key_nonce text not null,
  data_key_auth_tag text not null,
  content_nonce text not null,
  content_auth_tag text not null,
  key_version text not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_media_grants_cleanup
  on moderation_media_grants (expires_at);

revoke all on moderation_media_grants from public;
