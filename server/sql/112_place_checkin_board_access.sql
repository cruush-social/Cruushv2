-- Spot check-ins control board access. Board messages persist until deleted.
update place_board_messages
set expires_at = null
where expires_at is not null;

alter table place_board_messages
  alter column expires_at drop default;

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
    'announcement',
    'nearby_user',
    'pulse',
    'place_checkin_expired'
  )) not valid;
