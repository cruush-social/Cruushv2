create table if not exists moderation_system_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  provider text not null,
  surface text not null,
  content_type text not null,
  error_code text not null,
  error_message text not null,
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists idx_moderation_system_errors_open_fingerprint
  on moderation_system_errors (fingerprint)
  where resolved_at is null;

create index if not exists idx_moderation_system_errors_last_seen
  on moderation_system_errors (last_seen_at desc);
