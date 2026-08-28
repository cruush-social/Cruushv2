-- Zodiac sign. A plain profile column rather than part of the encrypted
-- sensitive blob, because people search on it.
alter table profiles
  add column if not exists zodiac text[] not null default '{}';
