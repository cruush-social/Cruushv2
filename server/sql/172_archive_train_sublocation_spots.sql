-- September 12: platforms, car-position notes, and unnamed train-direction
-- pins are sublocations of a parent station, never separate Spots.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive', 'Train platform or direction sublocation archived; retain one parent station Spot'
from places p
where p.status = 'published'
  and p.id in (
    '22240380-32cf-524f-9219-2a2604eb21c8',
    '94d69bb5-7d3f-58e6-9cc9-bc410e50fc84',
    '0d430c1e-277f-4421-8701-c632750cbaa9'
  )
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
