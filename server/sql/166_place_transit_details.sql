-- Public operator signage and schedule information. No member data changes.
alter table places add column if not exists transit_details jsonb;

-- Stable feed identities map to the retained parent Spot, including multiple
-- platforms/entrances and multiple operators sharing one station.
create table if not exists place_transit_sources (
  source_key text primary key,
  place_id uuid not null references places(id),
  source_url text not null,
  source_sha256 text not null,
  imported_at timestamptz not null default now()
);
create index if not exists place_transit_sources_place_idx on place_transit_sources(place_id);

create table if not exists place_transit_originals_20260912 (
  place_id uuid primary key,
  original_record jsonb not null,
  recorded_at timestamptz not null default now()
);
