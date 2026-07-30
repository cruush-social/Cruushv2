create table if not exists beta_city_requests (
  id uuid primary key default gen_random_uuid(),
  email_ciphertext text not null,
  email_nonce text not null,
  email_auth_tag text not null,
  email_key_version text not null default 'v1',
  email_hash text not null,
  requested_city_ciphertext text not null,
  requested_city_nonce text not null,
  requested_city_auth_tag text not null,
  requested_city_key_version text not null default 'v1',
  requested_city_hash text not null,
  source text not null default 'launch_beta_geofence',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_city_requests_source_check
    check (source in ('launch_beta_geofence'))
);

create unique index if not exists beta_city_requests_unique_email_city
  on beta_city_requests (email_hash, requested_city_hash);

create index if not exists beta_city_requests_created_idx
  on beta_city_requests (created_at desc);
