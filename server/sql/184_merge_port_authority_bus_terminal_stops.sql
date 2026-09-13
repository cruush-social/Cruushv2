-- September 12 official NJ TRANSIT review: these carrier, route, and platform
-- markers all describe the one Port Authority Bus Terminal. Retain one terminal
-- Spot, preserve every official-source identity, and archive nested markers.
with candidates(id) as (
  values
    ('50f9bf13-c0cd-54c4-a629-b0a08e382d1b'::uuid),
    ('291ff899-5268-59ef-acac-551f21d8890f'::uuid),
    ('3a9b488f-bafc-55cf-a82c-54fbff41a9c4'::uuid),
    ('455407a3-cf7e-586f-a2a3-74399f2b44aa'::uuid),
    ('22d6c7a5-433d-528f-a33e-d62a1e142a66'::uuid),
    ('b0e811c0-6c42-51ba-aecb-6a570befd8e3'::uuid),
    ('d10d4e7a-4dfc-5046-aa37-d06598ce9714'::uuid),
    ('d7dac72a-1319-55fd-ac9c-24d8c8cda021'::uuid),
    ('ae414603-89d8-5cb6-9fc7-1ec8b7ba5c57'::uuid)
), saved_originals as (
  insert into place_transit_originals_20260912 (place_id, original_record)
  select p.id, to_jsonb(p)
  from places p
  join candidates c on c.id = p.id
  where p.status = 'published'
  on conflict (place_id) do nothing
), raw_services as (
  select
    nullif(service->>'operator', '') as operator,
    nullif(service->>'route', '') as route,
    nullif(service->>'direction', '') as direction,
    case when jsonb_typeof(service->'destinations') = 'array'
      then service->'destinations' else '[]'::jsonb end as destinations
  from places p
  join candidates c on c.id = p.id
  cross join jsonb_array_elements(
    case when jsonb_typeof(p.transit_details->'services') = 'array'
      then p.transit_details->'services' else '[]'::jsonb end
  ) as service
  where p.status = 'published'
), service_groups as (
  select
    operator,
    route,
    direction,
    coalesce(
      jsonb_agg(distinct to_jsonb(destination) order by to_jsonb(destination))
        filter (where destination is not null),
      '[]'::jsonb
    ) as destinations
  from raw_services
  left join lateral jsonb_array_elements_text(destinations) as destination(destination) on true
  where operator is not null and route is not null
  group by operator, route, direction
), retained_details as (
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'route', route,
          'operator', operator,
          'direction', direction,
          'destinations', destinations
        ))
        order by operator, route, direction nulls first
      )
      from service_groups
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
      ) links
    ), '[]'::jsonb),
    'entrances', '[]'::jsonb
  ) as transit_details
)
update places p
set name = 'Port Authority Bus Terminal',
    address = 'West 41st Street & 8th Avenue, New York, NY',
    facility_type = 'bus_stop',
    source_kind = 'official',
    source_url = 'https://content.njtransit.com/station/port-authority-bus-terminal',
    source_attribution = 'NJ TRANSIT, Academy Bus, Coach USA, Trailways, Lakeland Bus Lines',
    transit_details = retained_details.transit_details,
    updated_at = now()
from retained_details
where p.id = '3a9b488f-bafc-55cf-a82c-54fbff41a9c4'
  and p.status = 'published';

update place_transit_sources
set place_id = '3a9b488f-bafc-55cf-a82c-54fbff41a9c4'
where place_id in (
  '50f9bf13-c0cd-54c4-a629-b0a08e382d1b',
  '291ff899-5268-59ef-acac-551f21d8890f',
  '455407a3-cf7e-586f-a2a3-74399f2b44aa',
  '22d6c7a5-433d-528f-a33e-d62a1e142a66',
  'b0e811c0-6c42-51ba-aecb-6a570befd8e3',
  'd10d4e7a-4dfc-5046-aa37-d06598ce9714',
  'd7dac72a-1319-55fd-ac9c-24d8c8cda021'
);

insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select p.id, to_jsonb(p), 'archive',
       'Carrier, route, platform, or generic marker merged into one physical Port Authority Bus Terminal Spot; official services and source identities retained on parent'
from places p
where p.id in (
  '50f9bf13-c0cd-54c4-a629-b0a08e382d1b',
  '291ff899-5268-59ef-acac-551f21d8890f',
  '455407a3-cf7e-586f-a2a3-74399f2b44aa',
  '22d6c7a5-433d-528f-a33e-d62a1e142a66',
  'b0e811c0-6c42-51ba-aecb-6a570befd8e3',
  'd10d4e7a-4dfc-5046-aa37-d06598ce9714',
  'd7dac72a-1319-55fd-ac9c-24d8c8cda021',
  'ae414603-89d8-5cb6-9fc7-1ec8b7ba5c57'
)
  and p.status = 'published'
on conflict (place_id) do nothing;

update places p
set status = 'archived', updated_at = now()
from place_category_cleanup_20260912 c
where p.id = c.place_id
  and c.action = 'archive'
  and p.status = 'published';
