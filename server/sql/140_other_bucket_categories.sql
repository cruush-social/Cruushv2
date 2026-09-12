-- The Other bucket is workbook data, not imported padding: the parking decks,
-- rest stops, wooded paths and store lots people actually named. One generic
-- pin for all of it tells a reader nothing, so the recognisable kinds get their
-- own category and their own marker.
--
-- Order matters. Parking runs first because "Walmart parking lot or bathrooms"
-- is a parking lot before it is a store, and every statement is scoped to rows
-- still sitting in Other, so a replay finds nothing left to move.

update places
set facility_type = 'parking', updated_at = now()
where facility_type = 'other' and status = 'published'
  and name ~* 'park(ing)?\s*(lot|garage|deck)|garage|park ?(and|n) ?ride|\blot\b';

update places
set facility_type = 'rest_stop', updated_at = now()
where facility_type = 'other' and status = 'published'
  and name ~* 'rest (area|stop)|service (area|plaza)|truck stop';

update places
set facility_type = 'bridge', updated_at = now()
where facility_type = 'other' and status = 'published'
  and name ~* 'bridge|train track|railroad|underpass|overpass|tunnel';

update places
set facility_type = 'beach', updated_at = now()
where facility_type = 'other' and status = 'published'
  and name ~* 'beach|pier\b|boardwalk|marina|waterfront';

update places
set facility_type = 'woods', updated_at = now()
where facility_type = 'other' and status = 'published'
  and name ~* '\bwoods?\b|wooded|trail|greenway|forest|nature (path|preserve|center)';

update places
set facility_type = 'hotel', updated_at = now()
where facility_type = 'other' and status = 'published'
  and name ~* 'motel|hotel|\binn\b|lodge';

update places
set facility_type = 'retail', updated_at = now()
where facility_type = 'other' and status = 'published'
  and name ~* 'walmart|home depot|target\b|best buy|barnes|lowe''s|costco|ikea|\bmall\b|old navy|bookstore';
