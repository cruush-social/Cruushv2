-- September 12: remove cafe Spots regardless of stale import classification.
-- Preserve original records for any future restoration supported by aggregated
-- member use.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive', 'Cafe Spot archived; category removed for now'
from places p
where p.status = 'published'
  and p.name ~* '\m(cafe|coffee)\M'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
