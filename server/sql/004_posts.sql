create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  expires_in text not null check (expires_in in ('1h', '6h', '24h', 'never')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists posts_user_id_idx on posts (user_id);
create index if not exists posts_created_at_idx on posts (created_at desc);
create index if not exists posts_expires_at_idx on posts (expires_at);
