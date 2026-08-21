do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'feature_restrictions_feature_check'
  ) then
    alter table feature_restrictions
      drop constraint feature_restrictions_feature_check;
  end if;
end $$;

alter table feature_restrictions
  add constraint feature_restrictions_feature_check
  check (feature in (
    'feed_posting',
    'direct_messages',
    'group_messages',
    'group_creation',
    'profile_updates',
    'photo_uploads',
    'map_visibility',
    'crowd_visibility'
  ));

alter table posts
  add column if not exists content_ciphertext text,
  add column if not exists content_nonce text,
  add column if not exists content_auth_tag text,
  add column if not exists content_key_version text;

alter table messages
  add column if not exists content_ciphertext text,
  add column if not exists content_nonce text,
  add column if not exists content_auth_tag text,
  add column if not exists content_key_version text,
  add column if not exists expires_at timestamptz;

alter table conversations
  add column if not exists disappearing_timer text not null default 'off',
  add column if not exists closed_at timestamptz;

alter table conversation_members
  add column if not exists role text not null default 'member';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'conversations_disappearing_timer_check'
  ) then
    alter table conversations
      drop constraint conversations_disappearing_timer_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'conversation_members_role_check'
  ) then
    alter table conversation_members
      drop constraint conversation_members_role_check;
  end if;
end $$;

alter table conversations
  add constraint conversations_disappearing_timer_check
  check (disappearing_timer in ('off', '1h', '24h', '7d', '30d'));

alter table conversation_members
  add constraint conversation_members_role_check
  check (role in ('owner', 'admin', 'member'));

create table if not exists media_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references app_users(id) on delete cascade,
  surface text not null check (surface in ('profile_photo', 'private_photo', 'message_photo')),
  object_key text not null unique,
  public_url text not null unique,
  media_type text not null,
  mime_type text not null,
  byte_size integer not null,
  encrypted_data_key text not null,
  data_key_nonce text not null,
  data_key_auth_tag text not null,
  content_nonce text not null,
  content_auth_tag text not null,
  key_version text not null,
  moderation_status text not null default 'allowed',
  photodna_status text not null default 'not_configured',
  photodna_provider_request_id text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_media_objects_owner_created
  on media_objects (owner_user_id, created_at desc);

create index if not exists idx_media_objects_public_url
  on media_objects (public_url)
  where deleted_at is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'media_objects_surface_check'
  ) then
    alter table media_objects
      drop constraint media_objects_surface_check;
  end if;
end $$;

alter table media_objects
  add constraint media_objects_surface_check
  check (surface in ('profile_photo', 'private_photo', 'message_photo', 'message_media'));
