alter table app_users
  add column if not exists account_status text not null default 'active',
  add column if not exists account_status_updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'app_users_account_status_check'
  ) then
    alter table app_users
      drop constraint app_users_account_status_check;
  end if;
end $$;

alter table app_users
  add constraint app_users_account_status_check
  check (account_status in ('active', 'under_review', 'suspended', 'deleted'));

create index if not exists idx_app_users_account_status
  on app_users (account_status, account_status_updated_at desc);

create table if not exists moderator_users (
  user_id uuid primary key references app_users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

create index if not exists idx_moderator_users_role
  on moderator_users (role, created_at desc);

