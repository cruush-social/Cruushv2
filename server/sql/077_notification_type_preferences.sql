alter table notification_preferences
  add column if not exists nearby_enabled boolean not null default true;

alter table notification_preferences
  add column if not exists rewards_enabled boolean not null default true;
