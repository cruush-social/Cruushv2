-- September 12: archive remaining standalone parking lots and park-and-ride
-- locations missed by the word “parking” selector. Retain Lot Radio, which is
-- a named music venue rather than a parking facility, and actual bus stops.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive', 'Parking lot or park-and-ride Spot archived; reintroduction requires aggregated user evidence'
from places p
where p.status = 'published'
  and p.facility_type <> 'bus_stop'
  and p.name <> 'Lot Radio'
  and p.name ~* '\m(lot|park & ride|p&r)\M'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
