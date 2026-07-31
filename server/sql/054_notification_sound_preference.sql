alter table notification_preferences
  add column if not exists sound_enabled boolean not null default true;
