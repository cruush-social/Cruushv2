alter table notification_preferences
  add column if not exists site_reminders_enabled boolean not null default true;

alter table app_notifications drop constraint if exists app_notifications_type_check;
alter table app_notifications add constraint app_notifications_type_check check (type in (
  'incoming_cruush', 'mutual_cruush', 'direct_message', 'group_message',
  'group_membership', 'nearby_activity', 'reward', 'announcement',
  'nearby_user', 'pulse', 'place_checkin_expired', 'subscription_expiring',
  'site_reminder'
)) not valid;
