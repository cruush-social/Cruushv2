alter table user_cruush_match_settings
  add column if not exists nsfw_photo_visibility text not null default 'public'
  check (nsfw_photo_visibility in ('public', 'mutual_cruushes', 'mutual_crowds'));
