create table if not exists launch_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  venue_name text not null,
  address text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  radius_miles numeric(5, 2) not null default 1,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  pin_disappears_at timestamptz not null,
  chat_expires_at timestamptz not null,
  ra_url text not null,
  icon_asset text not null default 'party-hat',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_events_window_check check (
    starts_at < ends_at
    and ends_at <= pin_disappears_at
    and pin_disappears_at < chat_expires_at
  ),
  constraint launch_events_radius_check check (radius_miles > 0 and radius_miles <= 10),
  constraint launch_events_ra_url_check check (ra_url ~ '^https://ra\.co/events/[0-9]+$')
);

create index if not exists idx_launch_events_active_window
  on launch_events (active, starts_at, pin_disappears_at);

create table if not exists event_memberships (
  event_id uuid not null references launch_events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists idx_event_memberships_user_joined
  on event_memberships (user_id, joined_at desc);

create index if not exists idx_event_memberships_event_seen
  on event_memberships (event_id, last_seen_at desc);

create table if not exists event_staff (
  event_id uuid not null references launch_events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null default 'staff' check (role in ('staff', 'owner')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists idx_event_staff_user
  on event_staff (user_id);

create table if not exists event_pass_icons (
  event_id uuid not null references launch_events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  icon_name text not null check (icon_name in (
    'camera',
    'cruush',
    'crowds',
    'feed',
    'ghost',
    'lucky',
    'map',
    'messages',
    'notifications',
    'profile',
    'safety',
    'send',
    'settings',
    'visibility'
  )),
  generated_at timestamptz not null default now(),
  emailed_at timestamptz,
  primary key (event_id, user_id)
);

create index if not exists idx_event_pass_icons_user
  on event_pass_icons (user_id, generated_at desc);

create table if not exists event_chats (
  event_id uuid primary key references launch_events(id) on delete cascade,
  conversation_id uuid not null unique references conversations(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_chats_expiry
  on event_chats (expires_at);

create table if not exists feed_post_crowd_targets (
  post_id uuid not null references posts(id) on delete cascade,
  crowd text not null check (crowd in ('T4T', 'Dyke', 'Gay')),
  token_hash text not null,
  token_key_version text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, crowd, token_hash, token_key_version)
);

create index if not exists idx_feed_post_crowd_targets_crowd
  on feed_post_crowd_targets (crowd);

create index if not exists idx_feed_post_crowd_targets_token
  on feed_post_crowd_targets (token_hash, token_key_version, post_id);

insert into launch_events (
  id,
  slug,
  title,
  venue_name,
  address,
  latitude,
  longitude,
  radius_miles,
  starts_at,
  ends_at,
  pin_disappears_at,
  chat_expires_at,
  ra_url,
  icon_asset,
  active
) values (
  '4c18a3ac-5dbd-48b6-b24f-703fd6fbb11e',
  'the-chocolate-factory-launch',
  'cruush beta launch',
  'The Chocolate Factory',
  '70 Scott Ave, Brooklyn, NY 11237',
  40.70982,
  -73.92256,
  1,
  '2026-07-31T00:00:00-04:00',
  '2026-08-01T05:00:00-04:00',
  '2026-08-01T05:00:00-04:00',
  '2026-08-08T05:00:00-04:00',
  'https://ra.co/events/2483120',
  'party-hat',
  true
) on conflict (slug) do update
set
  title = excluded.title,
  venue_name = excluded.venue_name,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  radius_miles = excluded.radius_miles,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  pin_disappears_at = excluded.pin_disappears_at,
  chat_expires_at = excluded.chat_expires_at,
  ra_url = excluded.ra_url,
  icon_asset = excluded.icon_asset,
  active = excluded.active,
  updated_at = now();
