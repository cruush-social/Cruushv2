alter table app_users
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists product_updates_opt_in boolean not null default false;

create index if not exists app_users_verified_email_idx
  on app_users (email_verified_at)
  where email_verified_at is not null;
