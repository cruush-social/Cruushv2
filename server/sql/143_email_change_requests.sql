-- Changing the address on an account proves ownership of the new address before
-- anything moves. The pending address lives here, never on app_users, so a
-- request that is abandoned or hostile cannot lock a member out of their own
-- account or park an unverified address on it.
create table if not exists email_change_requests (
  user_id uuid primary key references app_users(id) on delete cascade,
  new_email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint email_change_requests_check check (expires_at > created_at)
);

create index if not exists email_change_requests_expires_idx on email_change_requests (expires_at);
