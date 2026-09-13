-- September 12 manual map review: Charles Mayes Track is a feature within
-- Jersey City's Lincoln Park, not an independent destination Spot.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select id, to_jsonb(places), 'archive',
       'Internal Lincoln Park track archived; retain one parent park Spot'
from places
where id = 'b0c90deb-eeca-5721-bb42-4330d68b8bf0'
  and name = 'Charles Mayes Track/Lincoln Park JC'
  and facility_type = 'other'
  and status = 'published'
  and source_kind = 'community'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
