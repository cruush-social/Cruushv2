-- Add the requested Feed expiry choices below seven days without changing any
-- existing post or its expiry.
do $$
begin
  if exists (select from pg_constraint where conname = 'posts_expires_in_check_v4') then
    return;
  end if;

  alter table posts drop constraint if exists posts_expires_in_check;
  alter table posts drop constraint if exists posts_expires_in_check_v2;
  alter table posts drop constraint if exists posts_expires_in_check_v3;
  alter table posts add constraint posts_expires_in_check_v4
    check (expires_in in ('30m', '1h', '3h', '6h', '12h', '24h', '2d', '3d', '5d', '7d', 'never'));

  alter table user_privacy_settings drop constraint if exists user_privacy_settings_feed_post_expiry_default_check;
  alter table user_privacy_settings add constraint user_privacy_settings_feed_post_expiry_default_check
    check (feed_post_expiry_default in ('30m', '1h', '3h', '6h', '12h', '24h', '2d', '3d', '5d', '7d', 'never'));
end $$;
