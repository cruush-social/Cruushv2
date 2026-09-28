-- Pulse notifications.
--
-- A Pulse reaches everyone inside its radius. A notification is the tighter
-- rule: mutuals only, the ten nearest of them, never twice from the same person
-- in a day, and never less than four hours after the last one that person sent
-- anybody.
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
    'pulse'
  )) not valid;

alter table notification_preferences
  add column if not exists pulse_enabled boolean not null default true;

-- One row per Pulse notification actually sent, which is what the daily cap and
-- the four hour gap are counted against. Kept separate from app_notifications
-- so clearing a notification does not let the same Pulse through again.
create table if not exists map_ping_notifications (
  id uuid primary key default gen_random_uuid(),
  ping_id uuid not null references map_pings(id) on delete cascade,
  sender_user_id uuid not null references profiles(id) on delete cascade,
  recipient_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists map_ping_notifications_pair_idx
  on map_ping_notifications (sender_user_id, recipient_user_id, created_at desc);

create index if not exists map_ping_notifications_sender_idx
  on map_ping_notifications (sender_user_id, created_at desc);

create unique index if not exists map_ping_notifications_ping_recipient_idx
  on map_ping_notifications (ping_id, recipient_user_id);
