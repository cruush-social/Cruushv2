alter table profiles add column if not exists profile_visibility_ciphertext text;
alter table profiles add column if not exists profile_visibility_nonce text;
alter table profiles add column if not exists profile_visibility_auth_tag text;
alter table profiles add column if not exists profile_visibility_key_version text not null default 'v1';
alter table profiles add column if not exists profile_visibility_token_key_version text not null default 'v1';
alter table profiles add column if not exists trans_crowds_changed_at timestamptz;
