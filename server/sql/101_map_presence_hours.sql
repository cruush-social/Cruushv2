alter table user_privacy_settings
  add column if not exists map_presence_hours integer;

update user_privacy_settings
set map_presence_hours = least(168, greatest(1, map_presence_days * 24))
where map_presence_hours is null;

alter table user_privacy_settings
  alter column map_presence_hours set default 168,
  alter column map_presence_hours set not null;

alter table user_privacy_settings
  drop constraint if exists user_privacy_settings_map_presence_hours_check;

alter table user_privacy_settings
  add constraint user_privacy_settings_map_presence_hours_check
  check (map_presence_hours between 1 and 168);
