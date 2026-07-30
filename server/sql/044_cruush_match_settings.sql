create table if not exists user_cruush_match_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  nsfw_message_visibility text not null default 'mutual_cruushes',
  nsfw_send_visibility text not null default 'mutual_cruushes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_cruush_match_settings_nsfw_message_visibility_check
    check (nsfw_message_visibility in ('public', 'mutual_cruushes', 'none')),
  constraint user_cruush_match_settings_nsfw_send_visibility_check
    check (nsfw_send_visibility in ('public', 'mutual_cruushes', 'none'))
);

create index if not exists idx_user_cruush_match_settings_updated
  on user_cruush_match_settings (updated_at desc);
