-- Ghost mode pins pulse through the last minute of their rotation window so
-- viewers can tell the pin is about to move. It is on by default, but it does
-- broadcast "this profile is about to relocate", so let people switch it off.
alter table user_privacy_settings
  add column if not exists ghost_pulse_enabled boolean not null default true;
