alter table user_privacy_settings
  add column if not exists feed_window_default text not null default '7d';

update user_privacy_settings
set feed_window_default = '7d'
where feed_window_default is null;

alter table user_privacy_settings
  drop constraint if exists user_privacy_settings_feed_window_default_check;

alter table user_privacy_settings
  add constraint user_privacy_settings_feed_window_default_check
  check (feed_window_default in ('1h', '3h', '6h', '24h', '7d'));
