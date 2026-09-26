alter table app_notifications drop constraint if exists app_notifications_type_check;
alter table app_notifications add constraint app_notifications_type_check check (type in (
  'incoming_cruush', 'mutual_cruush', 'direct_message', 'group_message',
  'group_membership', 'nearby_activity', 'reward', 'announcement',
  'nearby_user', 'pulse', 'place_checkin_expired', 'subscription_expiring'
));
create table if not exists subscription_expiry_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  days_before integer not null check (days_before in (3, 1)),
  email_started_at timestamptz,
  email_sent_at timestamptz,
  push_done_at timestamptz,
  claim_token uuid not null,
  claimed_until timestamptz not null,
  unique (user_id, expires_at, days_before)
);
