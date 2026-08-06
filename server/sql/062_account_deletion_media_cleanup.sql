create table if not exists account_deletion_media_cleanup (
  object_key text primary key,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_deletion_media_cleanup_pending
  on account_deletion_media_cleanup (next_attempt_at, created_at)
  where completed_at is null;
