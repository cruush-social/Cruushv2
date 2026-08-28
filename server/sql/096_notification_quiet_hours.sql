-- Do not disturb hours. Off by default; when a member turns it on the window
-- starts at the midnight-to-six span most people mean by "overnight". Times are
-- minutes past local midnight and are read in the member's own zone, so a
-- window that wraps past midnight (start greater than end) is normal.
alter table notification_preferences
  add column if not exists quiet_hours_enabled boolean not null default false;

alter table notification_preferences
  add column if not exists quiet_hours_start_minute integer not null default 0;

alter table notification_preferences
  add column if not exists quiet_hours_end_minute integer not null default 360;

alter table notification_preferences
  add column if not exists quiet_hours_timezone text not null default 'UTC';

alter table notification_preferences
  drop constraint if exists notification_preferences_quiet_hours_range;

alter table notification_preferences
  add constraint notification_preferences_quiet_hours_range
  check (
    quiet_hours_start_minute >= 0
    and quiet_hours_start_minute < 1440
    and quiet_hours_end_minute >= 0
    and quiet_hours_end_minute < 1440
  );
