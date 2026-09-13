-- September 12: Bowery is a canonical MTA parent station, not a platform or
-- internal feature. Restore the existing Spot ID so its official station page
-- can be updated in place rather than creating a duplicate.
update places
set status = 'published', updated_at = now()
where id = '6800ae2e-03c0-448a-b9d6-3f9fec46d8d4'
  and name = 'Bowery'
  and facility_type = 'rail_station'
  and status = 'archived';
