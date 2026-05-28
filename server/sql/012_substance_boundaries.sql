alter table profiles
  add column if not exists substance_boundaries text[] not null default '{}';

alter table profiles
  drop column if exists smoking,
  drop column if exists custom_smoking,
  drop column if exists drinking,
  drop column if exists custom_drinking,
  drop column if exists drugs,
  drop column if exists custom_drugs,
  drop column if exists weed,
  drop column if exists custom_weed;
