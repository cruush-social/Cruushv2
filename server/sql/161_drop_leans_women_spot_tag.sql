-- Spots no longer classify a venue by who it leans toward. Remove the legacy
-- value before narrowing the database constraint and keep the health tags.
delete from place_tags where tag = 'leans_women';

alter table place_tags drop constraint if exists place_tags_tag_check;
alter table place_tags add constraint place_tags_tag_check check (tag in (
  'lgbtq_health', 'womens_health', 'sexual_health'
));
