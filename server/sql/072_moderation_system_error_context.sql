alter table moderation_system_errors
  add column if not exists last_content_id text,
  add column if not exists last_provider_request_id text;
