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
alter table profiles add column if not exists trans_status_visibility text not null default 'public';
alter table profiles add column if not exists scenes text[] not null default '{}';
alter table profiles add column if not exists archetypes text[] not null default '{}';
alter table profiles add column if not exists hiv_status_visibility text not null default 'mutual_cruushes';
alter table profiles add column if not exists profile_sensitive_ciphertext text;
alter table profiles add column if not exists profile_sensitive_nonce text;
alter table profiles add column if not exists profile_sensitive_auth_tag text;
alter table profiles add column if not exists profile_sensitive_key_version text not null default 'v1';
alter table profiles add column if not exists profile_sensitive_token_key_version text not null default 'v1';

alter table profiles
  drop constraint if exists profiles_kinks_visibility_check;

alter table profiles
  add constraint profiles_kinks_visibility_check
  check (kinks_visibility in ('public', 'mutual_cruushes', 'mutual_crowds'));

alter table profiles
  drop constraint if exists profiles_trans_status_visibility_check;

alter table profiles
  add constraint profiles_trans_status_visibility_check
  check (trans_status_visibility in ('public', 'mutual_cruushes', 'mutual_crowds'));

alter table profiles
  drop constraint if exists profiles_hiv_status_visibility_check;

alter table profiles
  add constraint profiles_hiv_status_visibility_check
  check (hiv_status_visibility in ('public', 'mutual_cruushes', 'mutual_crowds'));

create table if not exists profile_sensitive_tokens (
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  token_key_version text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, token_hash, token_key_version)
);

create index if not exists idx_profile_sensitive_tokens_hash
  on profile_sensitive_tokens (token_hash, token_key_version);
