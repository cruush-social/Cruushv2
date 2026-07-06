create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references app_users(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'conversation', 'message')),
  target_user_id uuid references app_users(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  reason text not null check (reason in (
    'non_consensual_imagery',
    'minor_safety',
    'impersonation',
    'coercion_trafficking',
    'illegal_activity',
    'spam_scam',
    'harassment',
    'fetishization',
    'hate',
    'violence_threat',
    'privacy_location',
    'other'
  )),
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'automod_processing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_type = 'profile' and target_user_id is not null) or
    (target_type = 'conversation' and conversation_id is not null) or
    (target_type = 'message' and message_id is not null)
  )
);

create index if not exists idx_reports_reporter_created_at
  on reports (reporter_user_id, created_at desc);

create index if not exists idx_reports_status_created_at
  on reports (status, created_at desc);

create index if not exists idx_reports_target_user_id
  on reports (target_user_id, created_at desc)
  where target_user_id is not null;

create index if not exists idx_reports_conversation_id
  on reports (conversation_id, created_at desc)
  where conversation_id is not null;

create index if not exists idx_reports_message_id
  on reports (message_id, created_at desc)
  where message_id is not null;
