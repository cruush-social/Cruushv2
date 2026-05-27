create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_reset_at_idx
  on rate_limit_buckets (reset_at);
