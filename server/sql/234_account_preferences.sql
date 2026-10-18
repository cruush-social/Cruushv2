-- Per-key writes cannot overwrite preferences changed on another surface.
create table if not exists account_preferences (
  user_id uuid not null references app_users(id) on delete cascade,
  preference_key text not null,
  ciphertext text not null,
  nonce text not null,
  auth_tag text not null,
  key_version text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, preference_key)
);
