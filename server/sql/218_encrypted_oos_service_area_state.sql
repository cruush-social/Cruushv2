-- Expand only. The application migrator encrypts and verifies every row in
-- the same transaction before contracting the legacy plaintext columns.
alter table oos_service_area_state
  add column if not exists state_ciphertext text,
  add column if not exists state_nonce text,
  add column if not exists state_auth_tag text,
  add column if not exists wrapped_state_dek text,
  add column if not exists state_dek_nonce text,
  add column if not exists state_dek_auth_tag text,
  add column if not exists state_key_version text;
