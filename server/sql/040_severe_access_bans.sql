create table if not exists severe_access_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  identity_type text not null check (identity_type in ('device', 'ip')),
  identity_hash text not null,
  reason_code text not null,
  permanent boolean not null default true,
  created_at timestamptz not null default now(),
  unique (identity_type, identity_hash)
);

create index if not exists idx_severe_access_bans_user
  on severe_access_bans (user_id, created_at desc);

revoke all on severe_access_bans from public;
