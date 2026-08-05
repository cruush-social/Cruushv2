alter table user_privacy_settings
  add column if not exists map_presence_days integer not null default 7;

alter table user_privacy_settings
  drop constraint if exists user_privacy_settings_map_presence_days_check;

alter table user_privacy_settings
  add constraint user_privacy_settings_map_presence_days_check
  check (map_presence_days between 1 and 30);
