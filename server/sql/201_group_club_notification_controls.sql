alter table conversation_members
  add column if not exists notification_level text not null default 'all',
  add column if not exists muted_until timestamptz;

alter table conversation_members
  drop constraint if exists conversation_members_notification_level_check;

alter table conversation_members
  add constraint conversation_members_notification_level_check
  check (notification_level in ('all', 'mentions'));
