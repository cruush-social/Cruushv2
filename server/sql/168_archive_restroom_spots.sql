-- September 12: a restroom is a sublocation within a venue, park, station, or
-- building, never its own Spot. Retain originals for any future restoration
-- supported by aggregated member use.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive', 'Restroom sublocation archived; reintroduction requires aggregated user evidence'
from places p
where p.status = 'published'
  and p.facility_type = 'restroom'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
