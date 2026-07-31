create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  type text not null check (type in ('incoming_cruush', 'mutual_cruush', 'direct_message', 'group_message', 'group_membership')),
  title text not null,
  body text not null default '',
  link_url text not null default '',
  actor_user_id uuid references app_users(id) on delete set null,
  conversation_id uuid references conversations(id) on delete cascade,
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_app_notifications_user_dedupe
  on app_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_app_notifications_user_created_at
  on app_notifications (user_id, created_at desc);

create index if not exists idx_app_notifications_user_unread_created_at
  on app_notifications (user_id, created_at desc)
  where read_at is null;

create table if not exists notification_preferences (
  user_id uuid primary key references app_users(id) on delete cascade,
  push_enabled boolean not null default false,
  cruush_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  groups_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_active
  on push_subscriptions (user_id, updated_at desc)
  where revoked_at is null;
