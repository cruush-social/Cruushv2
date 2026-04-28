create table if not exists cruushes (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id text not null,
  to_user_name text not null default '',
  to_user_pronouns text not null default '',
  to_user_photo text,
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id)
);

create index if not exists cruushes_from_user_id_idx on cruushes (from_user_id);
create index if not exists cruushes_to_user_id_idx on cruushes (to_user_id);
create index if not exists cruushes_created_at_idx on cruushes (created_at desc);
