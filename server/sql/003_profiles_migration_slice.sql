alter table profiles add column if not exists custom_pronouns text not null default '';
alter table profiles add column if not exists year_of_birth integer;
alter table profiles add column if not exists ethnicity text[] not null default '{}';
alter table profiles add column if not exists custom_hobby text not null default '';
alter table profiles add column if not exists hiv_status text[] not null default '{}';
alter table profiles add column if not exists custom_hiv_status text not null default '';
alter table profiles add column if not exists condoms text[] not null default '{}';
alter table profiles add column if not exists custom_condoms text not null default '';
alter table profiles add column if not exists prep text[] not null default '{}';
alter table profiles add column if not exists custom_prep text not null default '';
alter table profiles add column if not exists doxypep text[] not null default '{}';
alter table profiles add column if not exists custom_doxypep text not null default '';
alter table profiles add column if not exists covid_vaccine text[] not null default '{}';
alter table profiles add column if not exists custom_covid_vaccine text not null default '';
alter table profiles add column if not exists mpox_vaccine text[] not null default '{}';
alter table profiles add column if not exists custom_mpox_vaccine text not null default '';
alter table profiles add column if not exists substance_boundaries text[] not null default '{}';
alter table profiles add column if not exists role text[] not null default '{}';
alter table profiles add column if not exists kinks_visibility text not null default 'public';

alter table profiles
  drop constraint if exists profiles_kinks_visibility_check;

alter table profiles
  add constraint profiles_kinks_visibility_check
  check (kinks_visibility in ('public', 'mutual_cruushes', 'mutual_crowds'));
