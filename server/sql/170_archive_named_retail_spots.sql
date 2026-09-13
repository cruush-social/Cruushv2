-- September 12: remove clearly identified retail chains and retail complexes
-- that stale imports placed in the generic other bucket. Adult venues/stores,
-- parks, saunas, gyms, and transit records are outside this selector.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive', 'Retail store or retail complex archived; reintroduction requires aggregated user evidence'
from places p
where p.status = 'published'
  and p.facility_type = 'other'
  and (
    p.name ~* '\m(acme|hannaford|harbor freight|hobby lobby|home ?depot|kohl|petsmart|sam.s club|wegmans|wawa|weis|stop.?shop|quick check|delicious orchards|marshall.s|microcenter)\M'
    or p.name ~* '\m(mall|outlets?|shopping center)\M'
  )
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
