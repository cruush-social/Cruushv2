create table if not exists profile_visibility_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  name text not null,
  profile_visibility_ciphertext text not null,
  profile_visibility_nonce text not null,
  profile_visibility_auth_tag text not null,
  profile_visibility_key_version text not null default 'v1',
  profile_visibility_token_key_version text not null default 'v1',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_visibility_sets_name_check
    check (length(trim(name)) between 1 and 48)
);

create unique index if not exists profile_visibility_sets_user_name_idx
  on profile_visibility_sets (user_id, lower(name));

create index if not exists profile_visibility_sets_user_order_idx
  on profile_visibility_sets (user_id, display_order, updated_at desc);
