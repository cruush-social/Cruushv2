-- Leans men was applied to nearly every imported Spot, which tells a reader
-- nothing, and Techno club never earned a tag of its own. Both are gone. Leans
-- women stays, because it marks venues that are otherwise hard to find.
--
-- The rows are deleted rather than archived: a place tag carries no history
-- worth keeping once the tag itself is retired. Earlier migrations keep their
-- permissive constraint so a replay can still load a database that holds these
-- values; the narrow constraint lands here, after the rows are gone.
delete from place_tags where tag in ('leans_men', 'techno_club');

alter table place_tags drop constraint if exists place_tags_tag_check;
alter table place_tags add constraint place_tags_tag_check check (tag in (
  'lgbtq_health', 'womens_health', 'sexual_health', 'leans_women'
));
