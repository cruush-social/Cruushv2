create table if not exists user_blocks (
  blocker_user_id uuid not null references app_users(id) on delete cascade,
  blocked_user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create index if not exists idx_user_blocks_blocker_created
  on user_blocks (blocker_user_id, created_at desc);

create index if not exists idx_user_blocks_blocked_created
  on user_blocks (blocked_user_id, created_at desc);

alter table reports
  add column if not exists post_id uuid references posts(id) on delete set null,
  add column if not exists profile_photo_url text,
  add column if not exists media_object_id uuid references media_objects(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'reports_target_type_check'
  ) then
    alter table reports
      drop constraint reports_target_type_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'reports_check'
  ) then
    alter table reports
      drop constraint reports_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'reports_target_required_check'
  ) then
    alter table reports
      drop constraint reports_target_required_check;
  end if;
end $$;

alter table reports
  add constraint reports_target_type_check
  check (target_type in ('profile', 'conversation', 'message', 'post', 'profile_photo'));

alter table reports
  add constraint reports_target_required_check
  check (
    (target_type = 'profile' and target_user_id is not null) or
    (target_type = 'conversation' and conversation_id is not null) or
    (target_type = 'message' and message_id is not null) or
    (target_type = 'post' and post_id is not null) or
    (
      target_type = 'profile_photo' and
      target_user_id is not null and
      (nullif(profile_photo_url, '') is not null or media_object_id is not null)
    )
  );

create index if not exists idx_reports_post_id
  on reports (post_id, created_at desc)
  where post_id is not null;

create index if not exists idx_reports_media_object_id
  on reports (media_object_id, created_at desc)
  where media_object_id is not null;

create index if not exists idx_reports_profile_photo_url
  on reports (profile_photo_url, created_at desc)
  where profile_photo_url is not null;
