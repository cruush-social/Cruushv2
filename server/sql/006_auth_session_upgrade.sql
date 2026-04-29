alter table app_users
  add column if not exists display_name text,
  add column if not exists email_verified_at timestamptz;

create index if not exists idx_app_sessions_user_id
  on app_sessions (user_id);
