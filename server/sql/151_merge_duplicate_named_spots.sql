-- The same venue was imported more than once, so a single park could show up
-- as three Spots stacked on the map.
--
-- Only the unambiguous case is merged: two Spots carrying the same name, once
-- case, punctuation and repeated whitespace are ignored, sitting within
-- roughly 150m of each other. Two different venues that happen to share a name
-- across town are far apart and are left alone.
--
-- Nothing anyone wrote is destroyed. An imported duplicate is archived only when it holds
-- no check-ins, no ratings and no Pink Book posts; the copy that people have
-- actually used is the one that stays, and a duplicate that carries anything
-- of its own is left in place.
--
-- Replay-safe: archived/rejected records are excluded, and rows remain recoverable.
with normalized as (
  select id,
         slug,
         latitude,
         longitude,
         regexp_replace(lower(trim(name)), '[^a-z0-9]+', ' ', 'g') as key,
         coalesce((select count(*) from place_ratings where place_ratings.place_id = places.id), 0) as ratings,
         coalesce((select count(*) from place_checkins where place_checkins.place_id = places.id), 0) as checkins,
         coalesce((select count(*) from place_board_messages where place_board_messages.place_id = places.id), 0) as posts,
         created_at
  from places
  where coalesce(trim(name), '') <> ''
    and status = 'published'
),
keepers as (
  select distinct on (key, round(latitude::numeric, 2), round(longitude::numeric, 2))
         id, key, latitude, longitude
  from normalized
  order by key,
           round(latitude::numeric, 2),
           round(longitude::numeric, 2),
           ratings desc,
           checkins desc,
           posts desc,
           created_at asc,
           id asc
),
duplicates as (
  select candidate.id
  from normalized candidate
  join keepers keeper
    on keeper.key = candidate.key
   and keeper.id <> candidate.id
   and abs(candidate.latitude - keeper.latitude) < 0.0014
   and abs(candidate.longitude - keeper.longitude) < 0.0014
  where candidate.ratings = 0
    and candidate.slug like 'public-place-%'
    and candidate.checkins = 0
    and candidate.posts = 0
)
update places set status = 'archived', updated_at = now()
where id in (select id from duplicates) and status = 'published';
