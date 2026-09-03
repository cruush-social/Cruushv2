-- The workbook and the OpenStreetMap import each carried some of the same
-- places, so a handful of Spots landed twice: Soundview Park five times, and
-- Elsewhere twice fifteen metres apart, one row from each source. Two pins on
-- the same doorway split the check-ins and the Pink Book between them.
--
-- Same name, within roughly a hundred and fifty metres, and the oldest row
-- wins, since it is the one people may already have checked into or posted on.
-- The name has to match exactly, so separate branches of a chain keep their own
-- pin: all ninety-seven Planet Fitness locations survive, being nowhere near
-- each other. Archived rather than deleted, and idempotent because a second run
-- finds no published twin left to fold.
update places
set status = 'archived',
    updated_at = now()
where status = 'published'
  and exists (
    select 1
    from places kept
    where kept.status = 'published'
      and lower(kept.name) = lower(places.name)
      and kept.id <> places.id
      and (kept.created_at, kept.id) < (places.created_at, places.id)
      and abs(kept.latitude - places.latitude) < 0.0015
      and abs(kept.longitude - places.longitude) < 0.0015
  );
