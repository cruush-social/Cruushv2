-- September 12: archive cafes, ordinary retail, staircases and all parking facilities,
-- and combine adult categories. Reintroduction requires aggregate user evidence.
-- Keep original rows and all member references. Manual parent-venue decisions
-- are added separately after screenshot review; proximity is not a criterion.
create table if not exists place_category_cleanup_20260912 (
  place_id uuid primary key,
  original_record jsonb not null,
  action text not null check (action in ('archive', 'adult_venue')),
  reason text not null,
  recorded_at timestamptz not null default now()
);

insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p),
       case when p.facility_type in ('adult_shop', 'dungeon') then 'adult_venue' else 'archive' end,
       case when p.facility_type in ('adult_shop', 'dungeon') then 'Combined adult venue and store category'
            when p.facility_type = 'cafe' then 'Cafe category removed for now'
            when p.facility_type = 'parking' then 'Parking lots and garages archived; category removed for now'
            when p.facility_type = 'staircase' then 'Staircase sublocations archived; category removed for now'
            else 'Ordinary retail store or shopping mall removed' end
from places p
where p.status = 'published'
  and (p.facility_type in ('cafe', 'retail', 'parking', 'staircase', 'adult_shop', 'dungeon')
       or p.slug = 'public-place-63f68155b8280b002b0d8133')
on conflict (place_id) do nothing;

-- Read all recorded decisions, including on replay, rather than only rows
-- newly inserted into the backup table during this execution.
update places p set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id and c.action = 'archive' and p.status = 'published';

update places p set facility_type = 'adult_venue', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id and c.action = 'adult_venue'
  and p.facility_type in ('adult_shop', 'dungeon');
