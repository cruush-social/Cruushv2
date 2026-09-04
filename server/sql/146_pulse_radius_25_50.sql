-- The Pulse radius slider offers 25 and 50 miles, but the table constraint
-- stopped at 15, so those two radii failed at the database. Widen the check.
--
-- Replay-safe: the v2 constraint name is the sentinel. Once it exists this
-- migration does nothing, so a boot never drops and revalidates repeatedly.
do $$
begin
  if exists (
    select from pg_constraint
    where conname = 'map_pings_radius_miles_check_v2'
  ) then
    return;
  end if;

  alter table map_pings drop constraint if exists map_pings_radius_miles_check;
  alter table map_pings add constraint map_pings_radius_miles_check_v2
    check (radius_miles in (1, 3, 5, 10, 15, 25, 50));
end $$;
