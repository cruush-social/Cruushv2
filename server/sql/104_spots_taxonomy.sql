-- Preserve legacy Spot data before removing obsolete submission categories.
update places
set facility_type = 'other', updated_at = now()
where facility_type = 'venue';

-- Only the women-centred venues keep a lean tag; the men-leaning one is
-- retired, so the old gay_spot rows are dropped below rather than renamed.
insert into place_tags (place_id, tag)
select place_id, 'leans_women'
from place_tags
where tag in ('dyke_spot', 'dyke_bar')
on conflict (place_id, tag) do nothing;

delete from place_tags
where tag in ('gay_spot', 'dyke_spot', 'dyke_bar');

-- Same replay rule as 103: keep the later facility types accepted here so a
-- database that already holds them can run this migration again.
alter table places drop constraint if exists places_facility_type_check;
alter table places add constraint places_facility_type_check check (facility_type in (
  'clinic', 'bar', 'nightclub', 'community_space', 'park', 'restroom',
  'sauna', 'gym', 'hotel', 'dungeon', 'cafe', 'shop', 'library',
  'staircase', 'trail', 'transit', 'parking', 'beach', 'adult_venue',
  'adult_shop', 'music_venue', 'sports_venue',
  'retail', 'woods', 'rest_stop', 'bridge', 'other'
));

alter table place_tags drop constraint if exists place_tags_tag_check;
alter table place_tags add constraint place_tags_tag_check check (tag in (
  'lgbtq_health', 'womens_health', 'sexual_health', 'leans_men',
  'leans_women', 't4t_spot', 'techno_club'
));
