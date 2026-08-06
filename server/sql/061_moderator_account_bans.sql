-- Permanent bans for moderator enforcement, plus the moderator user-lookup indexes.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'app_users_account_status_check'
  ) then
    alter table app_users
      drop constraint app_users_account_status_check;
  end if;
end $$;

alter table app_users
  add constraint app_users_account_status_check
  check (account_status in ('active', 'under_review', 'suspended', 'banned', 'deleted'));

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
    'approve_content',
    'reject_content',
    'suspend_user',
    'mark_under_review',
    'unsuspend_user',
    'ban_user',
    'unban_user',
    'restrict_feature',
    'remove_post',
    'remove_media',
    'remove_message',
    'restore_user',
    'note'
  ));

create index if not exists idx_app_users_email_lookup
  on app_users (lower(email));

create index if not exists idx_app_users_display_name_lookup
  on app_users (lower(display_name));

create index if not exists idx_profiles_display_name_lookup
  on profiles (lower(display_name));
