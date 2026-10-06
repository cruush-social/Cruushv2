create table if not exists encrypted_club_enrollments (
  id uuid primary key default gen_random_uuid(),
  record_lookup_index text not null,
  club_index text not null,
  user_index text not null,
  record_type_index text not null,
  status_index text not null,
  record_ciphertext text not null,
  record_nonce text not null,
  record_auth_tag text not null,
  encryption_key_version text not null,
  index_key_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_lookup_index, index_key_version)
);

create index if not exists idx_encrypted_club_enrollments_club
  on encrypted_club_enrollments (club_index, record_type_index, status_index, index_key_version, created_at);

create index if not exists idx_encrypted_club_enrollments_user
  on encrypted_club_enrollments (user_index, record_type_index, status_index, index_key_version, created_at desc);

alter table conversation_members
  drop constraint if exists conversation_members_pkey;

alter table conversation_members
  alter column user_id drop not null,
  add column if not exists member_index text;

create unique index if not exists idx_conversation_members_plain_member
  on conversation_members (conversation_id, user_id)
  where user_id is not null;

create unique index if not exists idx_conversation_members_opaque_member
  on conversation_members (conversation_id, member_index)
  where member_index is not null;

alter table conversation_members
  drop constraint if exists conversation_members_identity_check;

alter table conversation_members
  add constraint conversation_members_identity_check
  check ((user_id is null) <> (member_index is null));
