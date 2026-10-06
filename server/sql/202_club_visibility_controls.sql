alter table clubs
  add column if not exists visibility_ciphertext text,
  add column if not exists visibility_nonce text,
  add column if not exists visibility_auth_tag text,
  add column if not exists visibility_key_version text not null default 'v1',
  add column if not exists visibility_token_key_version text not null default 'v1';
