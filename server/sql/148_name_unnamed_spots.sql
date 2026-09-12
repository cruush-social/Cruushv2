-- Six imported Spots carried no real name, just "Cruising" or "Cruising spot",
-- which tells a member nothing about where they are going.
--
-- The names below pair the facility with the locality the coordinates actually
-- fall in, reverse geocoded from OpenStreetMap rather than guessed. No venue
-- name is invented: where the import knew of no venue, the Spot is named for
-- what it is and where it is.
--
-- Replay-safe: each update is guarded on the placeholder name it replaces, so a
-- Spot renamed by anyone afterwards is never overwritten.
update places set name = 'East Haven gym'
  where id = '7b42435e-2430-4368-96cb-b114e453af99' and name = 'Cruising';

update places set name = 'Hempstead cruising spot'
  where id = '2a61f23a-4bf5-52b9-9e69-268521a8809b' and name = 'Cruising Spot';

update places set name = 'East Germantown park'
  where id = 'cde6e446-4c37-577e-80d7-caf152868df1' and name = 'Cruising spot';

update places set name = 'Danbury park'
  where id = 'fdaad875-3572-54d8-98d6-4a273dbb4f49' and name = 'Cruising spot';

update places set name = 'Jersey City sauna'
  where id = 'f75e0382-1139-40a0-8aa1-c69339a2122a' and name = 'Cruising spot';

update places set name = 'East Rutherford cruising spot'
  where id = '02457ffa-f100-5c12-9814-8b0422354cdc' and name = 'Cruising spot';
