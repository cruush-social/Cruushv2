-- September 12 manual map review: the MTA WTC Cortlandt marker and PATH World
-- Trade Center marker occupy one physical World Trade Center station complex.
-- Preserve the PATH Spot ID, transfer MTA provenance and services, and archive
-- only the redundant MTA parent.
with source_records as (
  select path.transit_details as path_details, mta.transit_details as mta_details
  from places path
  cross join places mta
  where path.id = '14a336fa-3268-58b4-ae26-9fa975a869a3'
    and mta.id = '3a29f851-1c3d-5c4c-a603-24ed572d9ba9'
), combined as (
  select jsonb_build_object(
    'services', (
      select jsonb_agg(item order by item->>'operator', item->>'route', item->>'direction')
      from (
        select distinct item
        from jsonb_array_elements(
          coalesce(path_details->'services', '[]'::jsonb)
          || coalesce(mta_details->'services', '[]'::jsonb)
        ) as item
      ) services
    ),
    'entrances', (
      select jsonb_agg(item order by item->>'name', item->>'side', item->>'direction')
      from (
        select distinct item
        from jsonb_array_elements(
          coalesce(path_details->'entrances', '[]'::jsonb)
          || coalesce(mta_details->'entrances', '[]'::jsonb)
        ) as item
      ) entrances
    ),
    'scheduleLinks', (
      select jsonb_agg(item order by item->>'label', item->>'url')
      from (
        select distinct item
        from jsonb_array_elements(
          coalesce(path_details->'scheduleLinks', '[]'::jsonb)
          || coalesce(mta_details->'scheduleLinks', '[]'::jsonb)
        ) as item
      ) schedules
    )
  ) as transit_details
  from source_records
)
update places
set name = 'World Trade Center / WTC Cortlandt',
    facility_type = 'rail_station',
    source_kind = 'official',
    source_url = 'https://www.mta.info/schedules/subway/1-train',
    source_attribution = 'MTA New York City Transit, PATH',
    transit_details = combined.transit_details,
    updated_at = now()
from combined
where id = '14a336fa-3268-58b4-ae26-9fa975a869a3'
  and status = 'published';

update place_transit_sources
set place_id = '14a336fa-3268-58b4-ae26-9fa975a869a3'
where place_id = '3a29f851-1c3d-5c4c-a603-24ed572d9ba9';

insert into place_category_cleanup_20260912 (place_id, original_record, action, reason)
select id, to_jsonb(places), 'archive',
       'MTA WTC Cortlandt merged into the same physical World Trade Center station complex Spot as PATH; MTA services and source identities retained on the parent'
from places
where id = '3a29f851-1c3d-5c4c-a603-24ed572d9ba9'
  and status = 'published'
on conflict (place_id) do nothing;

update places
set status = 'archived', updated_at = now()
where id = '3a29f851-1c3d-5c4c-a603-24ed572d9ba9'
  and status = 'published';
