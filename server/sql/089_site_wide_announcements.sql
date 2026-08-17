alter table app_notifications
  drop constraint if exists app_notifications_type_check;

alter table app_notifications
  add constraint app_notifications_type_check
  check (type in (
    'incoming_cruush',
    'mutual_cruush',
    'direct_message',
    'group_message',
    'group_membership',
    'nearby_activity',
    'reward',
    'announcement'
  ));

alter table moderation_access_events
  drop constraint if exists moderation_access_events_access_type_check;

alter table moderation_access_events
  add constraint moderation_access_events_access_type_check
  check (access_type in (
    'queue_detail',
    'media_preview',
    'review_preview',
    'site_wide_announcement'
  ));
