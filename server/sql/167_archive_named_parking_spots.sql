-- September 12: remove every parking-lot or garage Spot, even when a stale
-- import classified it as a park, beach, gym, bar, or other. Preserve actual
-- bus-stop records at park-and-rides; they represent transit service rather
-- than standalone parking Spots.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive', 'Parking lot or garage Spot archived; reintroduction requires aggregated user evidence'
from places p
where p.status = 'published'
  and p.facility_type <> 'bus_stop'
  and p.name ~* '\mparking\M'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
