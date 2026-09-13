-- September 12 map review: Meat Rock is a named feature inside Central Park,
-- not a separate venue. Retain the single Central Park parent Spot.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive',
       'Internal Central Park feature archived; retain one parent park Spot'
from places p
where p.id = 'b3d709c7-026e-5d30-b2d7-967594d6e6d5'
  and p.name = 'Meat Rock 🥩'
  and p.facility_type = 'shop'
  and p.status = 'published'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
