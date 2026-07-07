alter table app_users
  add column if not exists code_of_conduct_accepted_version text,
  add column if not exists code_of_conduct_accepted_at timestamptz;
