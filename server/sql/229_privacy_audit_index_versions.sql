-- Record the index version separately from the encryption version. Legacy
-- rows remain null rather than guessing how their opaque indexes were made.
alter table encrypted_privacy_audit_events
  add column if not exists index_key_version text;
