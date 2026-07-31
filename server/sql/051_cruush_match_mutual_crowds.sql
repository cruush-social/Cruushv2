alter table user_cruush_match_settings
  drop constraint if exists user_cruush_match_settings_nsfw_message_visibility_check;

alter table user_cruush_match_settings
  add constraint user_cruush_match_settings_nsfw_message_visibility_check
  check (nsfw_message_visibility in ('public', 'mutual_cruushes', 'mutual_crowds', 'none'));

alter table user_cruush_match_settings
  drop constraint if exists user_cruush_match_settings_nsfw_send_visibility_check;

alter table user_cruush_match_settings
  add constraint user_cruush_match_settings_nsfw_send_visibility_check
  check (nsfw_send_visibility in ('public', 'mutual_cruushes', 'mutual_crowds', 'none'));
