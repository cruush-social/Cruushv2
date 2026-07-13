create table if not exists moderation_media_grants (
  id uuid primary key,
  media_object_id uuid not null references media_objects(id) on delete cascade,
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

alter table moderation_media_grants
  add column if not exists media_object_id uuid references media_objects(id) on delete cascade;

delete from moderation_media_grants
where media_object_id is null;

alter table moderation_media_grants
  alter column media_object_id set not null;

create index if not exists idx_moderation_media_grants_cleanup
  on moderation_media_grants (expires_at);

create index if not exists idx_moderation_media_grants_media_object
  on moderation_media_grants (media_object_id);

revoke all on moderation_media_grants from public;
