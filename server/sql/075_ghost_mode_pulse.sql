-- Give every Ghost Mode profile its own rotation cycle and let people opt out
-- of the visible final-minute heartbeat. Existing Ghost Mode profiles use
-- their last privacy-setting update as the start of their first anchored cycle.
alter table user_privacy_settings
  add column if not exists ghost_mode_anchor_ms bigint;

alter table user_privacy_settings
  add column if not exists ghost_pulse_enabled boolean not null default true;

update user_privacy_settings
set ghost_mode_anchor_ms = (extract(epoch from coalesce(updated_at, now())) * 1000)::bigint
where ghost_mode_enabled = true
  and ghost_mode_anchor_ms is null;
