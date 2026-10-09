alter table user_privacy_settings
  drop constraint if exists user_privacy_settings_feed_window_default_check;

alter table user_privacy_settings
  add constraint user_privacy_settings_feed_window_default_check
  check (feed_window_default in ('1h', '3h', '6h', '24h', '7d', '8d', '9d', '10d', '11d', '12d', '13d', '14d', '15d', '16d', '17d', '18d', '19d', '20d', '21d', '22d', '23d', '24d', '25d', '26d', '27d', '28d', '29d', '30d', 'never'));
