alter table profiles
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists profiles_tags_gin_idx
  on profiles using gin (tags);
