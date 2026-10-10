-- Preserve saved member choices; apply the new default only to future rows.
alter table user_privacy_settings
  alter column feed_window_default set default '30d';
