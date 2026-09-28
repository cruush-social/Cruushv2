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
  )) not valid;
