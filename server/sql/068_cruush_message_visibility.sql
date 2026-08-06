alter table user_cruush_match_settings
  add column if not exists message_visibility text;

alter table user_cruush_match_settings
  alter column message_visibility set default 'mutual_cruushes';

update user_cruush_match_settings
set message_visibility = 'mutual_cruushes'
where message_visibility is null;

alter table user_cruush_match_settings
  drop constraint if exists user_cruush_match_settings_message_visibility_check;

alter table user_cruush_match_settings
  add constraint user_cruush_match_settings_message_visibility_check
  check (message_visibility in ('public', 'mutual_cruushes', 'mutual_crowds'));

alter table user_cruush_match_settings
  alter column message_visibility set not null;
