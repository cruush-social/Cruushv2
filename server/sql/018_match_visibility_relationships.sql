create table if not exists cruush_matches (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references profiles(id) on delete cascade,
  user_two_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint cruush_matches_order_check check (user_one_id < user_two_id),
  unique (user_one_id, user_two_id)
);

create index if not exists cruush_matches_user_one_id_idx
  on cruush_matches (user_one_id)
  where revoked_at is null;

create index if not exists cruush_matches_user_two_id_idx
  on cruush_matches (user_two_id)
  where revoked_at is null;

create table if not exists cruush_match_tokens (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references cruush_matches(id) on delete cascade,
  purpose text not null,
  user_one_id uuid not null references profiles(id) on delete cascade,
  user_two_id uuid not null references profiles(id) on delete cascade,
  token_ciphertext text not null,
  token_nonce text not null,
  token_auth_tag text not null,
  token_signature text not null,
  token_key_version text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists cruush_match_tokens_match_purpose_idx
  on cruush_match_tokens (match_id, purpose, expires_at)
  where revoked_at is null;

create table if not exists profile_view_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references profiles(id) on delete cascade,
  viewer_user_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  dedupe_bucket timestamptz not null,
  unique (target_user_id, viewer_user_id, dedupe_bucket)
);

create index if not exists profile_view_events_target_viewed_at_idx
  on profile_view_events (target_user_id, viewed_at desc);

create table if not exists user_privacy_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  ghost_mode_enabled boolean not null default false,
  precise_location_visibility text not null default 'none',
  updated_at timestamptz not null default now(),
  constraint user_privacy_settings_precise_location_visibility_check
    check (precise_location_visibility in ('none', 'mutual_cruushes'))
);

create table if not exists user_entitlements (
  user_id uuid primary key references profiles(id) on delete cascade,
  cruush_plus_enabled boolean not null default false,
  cruush_plus_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
