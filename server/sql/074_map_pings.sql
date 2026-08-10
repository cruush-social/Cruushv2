create table if not exists map_pings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  radius_miles smallint not null check (radius_miles in (1, 3, 5, 10, 15)),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  constraint map_pings_expires_after_creation check (expires_at > created_at),
  constraint map_pings_user_idempotency_unique unique (user_id, idempotency_key)
);

create index if not exists idx_map_pings_user_created_at
  on map_pings (user_id, created_at desc);

create index if not exists idx_map_pings_expires_at
  on map_pings (expires_at);

alter table posts
  add column if not exists map_ping_id uuid references map_pings(id) on delete set null;

create unique index if not exists posts_map_ping_id_uidx
  on posts (map_ping_id)
  where map_ping_id is not null;

alter table user_privacy_settings
  add column if not exists feed_post_expiry_default text not null default 'never';

alter table user_privacy_settings
  drop constraint if exists user_privacy_settings_feed_post_expiry_default_check;

alter table user_privacy_settings
  add constraint user_privacy_settings_feed_post_expiry_default_check
  check (feed_post_expiry_default in ('1h', '6h', '24h', '7d', 'never'));
