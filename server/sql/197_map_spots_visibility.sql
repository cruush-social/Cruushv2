alter table user_privacy_settings
  add column if not exists map_spots_visible boolean;
