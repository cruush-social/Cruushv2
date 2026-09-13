-- September 12 source review: platforms A/B/C and carrier-specific Allentown
-- pins are services within the single Allentown Transportation Center. Retain
-- one physical bus-Stop Spot, preserve every operator source key, and archive
-- the internal-platform and duplicate carrier markers recoverably.
with candidates(id) as (
  values
    ('18ba8d19-ac9c-58c1-a730-90ef3093004f'::uuid),
    ('cbab9a0d-8957-5ae5-afdb-3e8574d9d687'::uuid),
    ('1d508559-281f-59fe-a2bb-50d51906e96b'::uuid),
    ('3e5b3b3c-1b9e-520e-a924-9f3bdb32915b'::uuid),
    ('c6a32f02-d52b-54fe-af3d-27746998360f'::uuid),
    ('8addab38-8551-5dbf-a9e8-fa9bfd42bd1e'::uuid)
), saved_originals as (
  insert into place_transit_originals_20260912 (place_id, original_record)
  select p.id, to_jsonb(p)
  from places p
  join candidates c on c.id = p.id
  where p.status = 'published'
  on conflict (place_id) do nothing
  returning place_id
), retained_details as (
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(service order by service->>'operator', service->>'route', service->>'direction')
      from (
        select distinct service
        from places p
        join candidates c on c.id = p.id
        cross join jsonb_array_elements(
          case when jsonb_typeof(p.transit_details->'services') = 'array'
            then p.transit_details->'services' else '[]'::jsonb end
        ) as service
        where p.status = 'published'
          and service->>'operator' <> 'Fullington Trailways'
        union
        select service
        from jsonb_array_elements(jsonb_build_array(
          jsonb_build_object('route', 'FAB 10', 'operator', 'Fullington Trailways', 'direction', 'Williamsport → New York City', 'destinations', '[]'::jsonb),
          jsonb_build_object('route', 'FAB 11', 'operator', 'Fullington Trailways', 'direction', 'New York City → Williamsport', 'destinations', '[]'::jsonb),
          jsonb_build_object('route', 'FAB 20', 'operator', 'Fullington Trailways', 'direction', 'Williamsport → Philadelphia', 'destinations', '[]'::jsonb),
          jsonb_build_object('route', 'FAB 21', 'operator', 'Fullington Trailways', 'direction', 'Philadelphia → Williamsport', 'destinations', '[]'::jsonb)
        )) as service
      ) all_services
    ), '[]'::jsonb),
    'scheduleLinks', coalesce((
      select jsonb_agg(link order by link->>'label', link->>'url')
      from (
        select distinct link
        from places p
        join candidates c on c.id = p.id
        cross join jsonb_array_elements(
          case when jsonb_typeof(p.transit_details->'scheduleLinks') = 'array'
            then p.transit_details->'scheduleLinks' else '[]'::jsonb end
        ) as link
        where p.status = 'published'
      ) all_links
    ), '[]'::jsonb),
    'entrances', '[]'::jsonb
  ) as transit_details
)
update places p
set name = 'Allentown Transportation Center',
    latitude = 40.6044011,
    longitude = -75.4706885,
    address = '112 N. 6th Street, Allentown, PA 18101',
    facility_type = 'bus_stop',
    source_kind = 'official',
    source_url = 'https://www.fullingtontours.com/daily-bus-departures/',
    source_attribution = 'Fullington Trailways, LANTA, Trans-Bridge Lines',
    transit_details = retained_details.transit_details,
    updated_at = now()
from retained_details
where p.id = '18ba8d19-ac9c-58c1-a730-90ef3093004f'
  and p.status = 'published';

update place_transit_sources
set place_id = '18ba8d19-ac9c-58c1-a730-90ef3093004f'
where place_id in (
  'cbab9a0d-8957-5ae5-afdb-3e8574d9d687',
  '1d508559-281f-59fe-a2bb-50d51906e96b',
  '3e5b3b3c-1b9e-520e-a924-9f3bdb32915b',
  'c6a32f02-d52b-54fe-af3d-27746998360f',
  '8addab38-8551-5dbf-a9e8-fa9bfd42bd1e'
);

insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive',
       'Internal Allentown Transportation Center platform or carrier marker merged into one physical terminal Spot; services and source identities retained on parent'
from places p
where p.id in (
  'cbab9a0d-8957-5ae5-afdb-3e8574d9d687',
  '1d508559-281f-59fe-a2bb-50d51906e96b',
  '3e5b3b3c-1b9e-520e-a924-9f3bdb32915b',
  'c6a32f02-d52b-54fe-af3d-27746998360f',
  '8addab38-8551-5dbf-a9e8-fa9bfd42bd1e'
)
  and p.status = 'published'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
