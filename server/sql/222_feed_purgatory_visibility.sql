alter table user_privacy_settings
  add column if not exists feed_hide_from_purgatory boolean not null default false;
