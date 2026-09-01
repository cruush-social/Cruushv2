-- Spot-specific public descriptors. These never reuse profile vibes.
create table if not exists place_vibes (
  place_id uuid not null references places(id) on delete cascade,
  vibe text not null check (vibe in (
    'chill', 'social', 'flirty', 'cruisy', 'dancey', 'high_energy',
    'intimate', 'community', 'after_hours', 'outdoor', 'historical', 'exposed'
  )),
  primary key (place_id, vibe)
);

create index if not exists idx_place_vibes_vibe_place
  on place_vibes (vibe, place_id);

create table if not exists place_amenities (
  place_id uuid not null references places(id) on delete cascade,
  amenity text not null check (amenity in (
    'restrooms', 'drinks', 'cover_charge', 'accessible',
    'transit_nearby', 'staff_present', 'indoor', 'outdoor'
  )),
  primary key (place_id, amenity)
);

create index if not exists idx_place_amenities_amenity_place
  on place_amenities (amenity, place_id);
