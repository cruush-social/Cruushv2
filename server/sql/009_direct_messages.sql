alter table conversations
  add column if not exists dm_key text unique;
