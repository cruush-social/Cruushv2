alter table clubs
  add column if not exists requires_join_approval boolean not null default true;
