alter table user_privacy_settings
  add column if not exists feed_location_pin_visibility text not null default 'mutuals';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_privacy_settings_feed_location_pin_visibility_check'
  ) then
    alter table user_privacy_settings
      drop constraint user_privacy_settings_feed_location_pin_visibility_check;
  end if;
end $$;

alter table user_privacy_settings
  add constraint user_privacy_settings_feed_location_pin_visibility_check
  check (feed_location_pin_visibility in ('off', 'mutuals', 'same_crowd', 'public'));
