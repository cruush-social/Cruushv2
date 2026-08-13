alter table app_users
  add column if not exists signup_birth_year integer;

alter table app_users
  add column if not exists age_verified_at timestamptz;
