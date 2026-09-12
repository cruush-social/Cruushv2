alter table profiles
  add column if not exists body_hair text[] not null default '{}';
