-- September 12 manual map review: these two source-free community transit
-- markers are locations inside Brooklyn Bridge Park, not separate transport
-- services. Retain the single parent park Spot.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select id, to_jsonb(places), 'archive',
       'Internal Brooklyn Bridge Park location archived; retain one parent park Spot'
from places
where id in (
  '94ae15de-7be6-470d-a9eb-2342f734f4d8',
  'b3b7c300-6648-4a1e-b05f-70ce6f76036b'
)
  and status = 'published'
  and facility_type = 'transit'
  and source_kind = 'community'
  and source_url is null
  and transit_details is null
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
