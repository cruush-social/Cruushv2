alter table profiles
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists fuzzy_lat double precision,
  add column if not exists fuzzy_lng double precision,
  add column if not exists location_fuzz_radius_meters integer not null default 0,
  add column if not exists location_updated_at timestamptz;

alter table profiles
  drop constraint if exists profiles_location_fuzz_radius_meters_check;

alter table profiles
  add constraint profiles_location_fuzz_radius_meters_check
  check (location_fuzz_radius_meters >= 0 and location_fuzz_radius_meters <= 500);
