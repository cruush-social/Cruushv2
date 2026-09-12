-- Gyms are only worth showing when the retained workbook says people actually
-- cruise them. The OpenStreetMap import added every fitness centre in the
-- 100-mile radius, which buried the map without adding a single useful Spot.
-- Archived rather than deleted so the rows survive if the rule changes, and
-- written as an idempotent update so migration replay stays safe.
update places
set status = 'archived',
    updated_at = now()
where facility_type = 'gym'
  and source_kind = 'open_data'
  and status = 'published';
