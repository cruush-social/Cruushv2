-- Community spaces are only worth a pin when they are ours. The OpenStreetMap
-- import brought in every senior centre, lodge, VFW post and university, none of
-- which say anything to somebody opening the map. Keep the LGBT centres, keep
-- the YMCAs, archive the rest.
--
-- The YMCAs also come back as sports venues: migration 136 archived them with
-- the school fields, and they belong on the map. Both statements are idempotent
-- so migration replay stays safe.

update places
set status = 'published',
    updated_at = now()
where facility_type = 'sports_venue'
  and status = 'archived'
  and (name ilike '%ymca%' or name ilike '%ywca%');

-- Any community space already tagged queer stays, whatever it is called. The
-- women-centred venues arrive from migration 118 carrying leans_women, and a
-- name list alone would have thrown out New Women Space and the Yale Women's
-- Center for not having "LGBT" in the title.
update places
set status = 'archived',
    updated_at = now()
where facility_type = 'community_space'
  and status = 'published'
  and name not ilike '%ymca%'
  and name not ilike '%ywca%'
  and id not in (
    select place_id from place_tags
    where tag in ('leans_women', 'leans_men', 'lgbtq_health', 'womens_health')
  )
  and name not in (
    'Bradbury-Sullivan LGBT Community Center',
    'Brooklyn Community Pride Center',
    'Colectivo Intercultural TRANSgrediendo',
    'Destination Tomorrow',
    'Hudson Valley LGBTQ Community Center',
    'LGBTQ* Center at Stony Brook University',
    'NYC LGBT Community Center',
    'New Haven Pride Center',
    'Queer Resource Center',
    'The Pride Center of New Jersey',
    'Yale LGBTQ Center'
  );
