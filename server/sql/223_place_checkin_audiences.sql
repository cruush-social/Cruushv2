alter table place_checkins add column if not exists crowd_targets jsonb not null default '[]'::jsonb;
alter table place_checkins drop constraint if exists place_checkins_visibility_scope_check;
alter table place_checkins add constraint place_checkins_visibility_scope_check
  check (visibility_scope in ('hidden', 'public', 'checked_in', 'mutuals', 'crowd'));

alter table place_board_messages add column if not exists visibility_scope text not null default 'public';
alter table place_board_messages add column if not exists crowd_targets jsonb not null default '[]'::jsonb;
alter table place_board_messages drop constraint if exists place_board_messages_visibility_scope_check;
alter table place_board_messages add constraint place_board_messages_visibility_scope_check
  check (visibility_scope in ('public', 'mutuals', 'crowd'));
