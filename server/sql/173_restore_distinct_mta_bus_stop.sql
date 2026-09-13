-- September 12: opposite-direction physical bus stops remain separate Spots.
-- The user explicitly requires every bus stop; stop 308850 is distinct from
-- the retained KINGS HWY/NOSTRAND AV stop 300465 and must not be archived as a
-- generic duplicate.
update places
set status = 'published', updated_at = now()
where id = 'ea4ff7f5-5056-5321-a29c-a158db79b34d'
  and facility_type = 'bus_stop'
  and exists (
    select 1 from place_transit_sources s
    where s.place_id = places.id and s.source_key = 'mta-bus:308850'
  );
