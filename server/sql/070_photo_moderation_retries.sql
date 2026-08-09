alter table media_objects
  add column if not exists moderation_attempts integer not null default 0,
  add column if not exists moderation_next_retry_at timestamptz,
  add column if not exists moderation_hold jsonb;

alter table media_objects
  drop constraint if exists media_objects_moderation_attempts_check;

alter table media_objects
  add constraint media_objects_moderation_attempts_check
  check (moderation_attempts >= 0);

create index if not exists idx_media_objects_moderation_retries
  on media_objects (moderation_next_retry_at, created_at)
  where moderation_status = 'pending'
    and moderation_failure_reason = 'provider_unavailable'
    and deleted_at is null;
