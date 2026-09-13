-- September 12 current official Fullington daily-departures review: these
-- four raw-feed Stops do not appear anywhere in the operator's current page.
-- Keep their original records recoverably but remove stale transit markers
-- rather than presenting unsupported service.
insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive',
       'Raw Fullington stop is absent from the current official daily-departures page; archived pending a current operator station page'
from places p
where p.id in (
  '83ef5d8b-ab80-58b2-acc4-81765ba13449',
  'fc0394a8-9456-5e8c-a377-3b1f6959e714',
  '6a79f3bf-b485-511e-a972-9472c2b54bb1',
  '7735a9ed-8d90-5301-ab54-71cd22a04bc9'
)
  and p.status = 'published'
  and p.facility_type = 'bus_stop'
  and p.source_url = 'https://www.fullingtontours.com/daily-bus-departures/'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
