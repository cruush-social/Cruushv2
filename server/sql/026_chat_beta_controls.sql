alter table conversations
  add column if not exists cleared_at timestamptz,
  add column if not exists cleared_by uuid references app_users(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'conversations_disappearing_timer_check'
  ) then
    alter table conversations
      drop constraint conversations_disappearing_timer_check;
  end if;
end $$;

alter table conversations
  add constraint conversations_disappearing_timer_check
  check (disappearing_timer in ('off', '1h', '24h', '7d', '30d'));

alter table message_media_attachments
  add column if not exists view_once boolean not null default false;

create table if not exists message_media_views (
  message_id uuid not null references messages(id) on delete cascade,
  media_object_id uuid not null references media_objects(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (message_id, media_object_id, user_id)
);

create index if not exists idx_message_media_views_user_viewed
  on message_media_views (user_id, viewed_at desc);

create index if not exists idx_conversations_cleared_at
  on conversations (cleared_at)
  where cleared_at is not null;
