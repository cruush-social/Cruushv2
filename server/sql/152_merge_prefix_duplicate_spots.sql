-- The same venue was imported twice under a short name and a fuller one, so
-- "Sunset" sat beside "Sunset Adult" and "Bossa Nova" beside "Bossa Nova Civic
-- Club".
--
-- Only the unambiguous case is merged: one Spot's name is the start of
-- another's, on a word boundary, once case and punctuation are ignored, and
-- the two sit within roughly 150m. A short name that only coincidentally
-- begins another venue's name across town is far away and is left alone, and
-- names under four characters are skipped entirely.
--
-- The fuller name is the one worth keeping, so the short one goes, and only
-- when it holds no check-ins, no ratings and no Pink Book posts. A Spot
-- carrying anything anyone wrote is never deleted.
--
-- Replay-safe: once the short duplicates are gone the delete matches nothing.
with normalized as (
  select id,
         latitude,
         longitude,
         regexp_replace(lower(trim(name)), '[^a-z0-9]+', ' ', 'g') as key,
         coalesce((select count(*) from place_ratings r where r.place_id = places.id), 0) as ratings,
         coalesce((select count(*) from place_checkins c where c.place_id = places.id), 0) as checkins,
         coalesce((select count(*) from place_board_messages b where b.place_id = places.id), 0) as posts
  from places
  where coalesce(trim(name), '') <> ''
),
duplicates as (
  select distinct shorter.id
  from normalized shorter
  join normalized longer
    on longer.id <> shorter.id
   and length(longer.key) > length(shorter.key)
   and longer.key like shorter.key || ' %'
   and abs(shorter.latitude - longer.latitude) < 0.0014
   and abs(shorter.longitude - longer.longitude) < 0.0014
  where shorter.ratings = 0
    and shorter.checkins = 0
    and shorter.posts = 0
    and length(shorter.key) >= 4
)
delete from places where id in (select id from duplicates);
