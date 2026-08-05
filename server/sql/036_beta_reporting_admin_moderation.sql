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
    where conname = 'reports_target_required_check'
  ) then
    alter table reports
      drop constraint reports_target_required_check;
  end if;
end $$;

alter table reports
  add constraint reports_target_type_check
  check (target_type in ('user', 'profile', 'conversation', 'message', 'post', 'profile_photo'));

alter table reports
  add constraint reports_target_required_check
  check (
    (target_type = 'user' and target_user_id is not null) or
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

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'moderation_actions_action_check'
  ) then
    alter table moderation_actions
      drop constraint moderation_actions_action_check;
  end if;
end $$;

alter table moderation_actions
  add constraint moderation_actions_action_check
  check (action in (
    'resolve_report',
    'dismiss_report',
    'suspend_user',
    'mark_under_review',
    'unsuspend_user',
    -- Kept in step with 041 and 061. Migrations re-run on every deploy, so an
    -- older list here rejects rows written by newer code.
    'ban_user',
    'unban_user',
    'restrict_feature',
    'remove_post',
    'remove_media',
    'remove_message',
    'restore_user',
    'note'
  ));
