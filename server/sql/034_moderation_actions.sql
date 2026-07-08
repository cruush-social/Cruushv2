create table if not exists moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id) on delete set null,
  target_user_id uuid references app_users(id) on delete set null,
  report_id uuid references reports(id) on delete set null,
  content_review_id uuid references content_reviews(id) on delete set null,
  action text not null check (action in (
    'resolve_report',
    'dismiss_report',
    'suspend_user',
    'unsuspend_user',
    'restrict_feature',
    'remove_post',
    'remove_media',
    'remove_message',
    'restore_user',
    'note'
  )),
  reason_code text not null,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_actions_target_created
  on moderation_actions (target_user_id, created_at desc)
  where target_user_id is not null;

create index if not exists idx_moderation_actions_actor_created
  on moderation_actions (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists idx_moderation_actions_report_created
  on moderation_actions (report_id, created_at desc)
  where report_id is not null;

create index if not exists idx_moderation_actions_review_created
  on moderation_actions (content_review_id, created_at desc)
  where content_review_id is not null;
