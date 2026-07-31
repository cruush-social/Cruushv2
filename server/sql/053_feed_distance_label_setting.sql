alter table user_privacy_settings
  add column if not exists feed_show_distance_labels boolean not null default true;
