-- September 12: recover null arrays from the prior WTC merge and retain one
-- official MTA station-complex parent for the duplicate Park Place 2/3 page.
with recovered as (
  select p.id,
    jsonb_build_object(
      'services', coalesce((
        select jsonb_agg(item order by item->>'operator', item->>'route', item->>'direction')
        from (
          select item
          from jsonb_array_elements(
            case when jsonb_typeof(p.transit_details->'services') = 'array'
              then p.transit_details->'services' else '[]'::jsonb end
          ) as item
          union
          select item
          from jsonb_array_elements('[
            {"operator":"MTA New York City Transit","route":"1","direction":"Downtown","destinations":["South Ferry"]},
            {"operator":"MTA New York City Transit","route":"1","direction":"Uptown","destinations":["137 St-City College","215 St","Dyckman St","Van Cortlandt Park-242 St"]},
            {"operator":"PATH","route":"Newark - World Trade Center","destinations":[]},
            {"operator":"PATH","route":"Hoboken - World Trade Center","destinations":[]}
          ]'::jsonb) as item
        ) combined_services
      ), '[]'::jsonb),
      'entrances', coalesce((
        select jsonb_agg(item order by item->>'name', item->>'side', item->>'direction')
        from jsonb_array_elements(
          case when jsonb_typeof(p.transit_details->'entrances') = 'array'
            then p.transit_details->'entrances' else '[]'::jsonb end
        ) as item
      ), '[]'::jsonb),
      'scheduleLinks', coalesce((
        select jsonb_agg(item order by item->>'label', item->>'url')
        from (
          select item
          from jsonb_array_elements(
            case when jsonb_typeof(p.transit_details->'scheduleLinks') = 'array'
              then p.transit_details->'scheduleLinks' else '[]'::jsonb end
          ) as item
          union
          select item
          from jsonb_array_elements('[
            {"label":"1 schedule","url":"https://www.mta.info/schedules/subway/1-train"},
            {"label":"PATH schedules","url":"https://www.panynj.gov/path/en/schedules-maps.html"}
          ]'::jsonb) as item
        ) combined_links
      ), '[]'::jsonb)
    ) as transit_details
  from places p
  where p.id = '14a336fa-3268-58b4-ae26-9fa975a869a3'
    and p.status = 'published'
)
update places p
set transit_details = recovered.transit_details,
    updated_at = now()
from recovered
where p.id = recovered.id;

update place_transit_sources
set place_id = '61092906-87c3-53fa-a1d8-77e5314d4913'
where source_key = 'mta-subway:complex:park-place-2-3'
  and place_id = '676d50c6-d6b0-5e70-9d01-5316755e7f8a';

insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select id, to_jsonb(places), 'archive',
       'Park Place 2/3 is already part of the official MTA Chambers St/WTC/Park Place/Cortlandt St station complex; services and official source identities remain on that single parent Spot'
from places
where id = '676d50c6-d6b0-5e70-9d01-5316755e7f8a'
  and status = 'published'
on conflict (place_id) do nothing;

update places
set status = 'archived', updated_at = now()
where id = '676d50c6-d6b0-5e70-9d01-5316755e7f8a'
  and status = 'published';
