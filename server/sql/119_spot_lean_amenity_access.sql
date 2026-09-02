alter table places
  add column if not exists access_instructions text not null default '';

alter table places drop constraint if exists places_access_instructions_check;
alter table places add constraint places_access_instructions_check
  check (char_length(access_instructions) <= 1000);

create table if not exists place_amenity_reports (
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  amenity text not null check (amenity in (
    'restrooms', 'drinks', 'cover_charge', 'accessible',
    'transit_nearby', 'staff_present', 'indoor', 'outdoor'
  )),
  reported_at timestamptz not null default now(),
  primary key (place_id, user_id, amenity)
);

create index if not exists idx_place_amenity_reports_aggregate
  on place_amenity_reports (place_id, amenity, reported_at desc);

create table if not exists place_popular_time_baselines (
  place_id uuid not null references places(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  hour smallint not null check (hour in (0, 4, 8, 12, 16, 20)),
  visit_count integer not null check (visit_count >= 0),
  source_attribution text not null,
  primary key (place_id, weekday, hour, source_attribution)
);

alter table place_tags drop constraint if exists place_tags_tag_check;

insert into place_tags (place_id, tag)
select place_id,
       case when tag in ('dyke_spot', 'dyke_bar') then 'leans_women' else 'leans_men' end
from place_tags
where tag in ('gay_spot', 'dyke_spot', 'dyke_bar')
on conflict (place_id, tag) do nothing;

delete from place_tags where tag in ('gay_spot', 'dyke_spot', 'dyke_bar');

alter table place_tags add constraint place_tags_tag_check check (tag in (
  'lgbtq_health', 'womens_health', 'sexual_health', 'leans_men',
  'leans_women', 't4t_spot', 'techno_club'
));

insert into place_tags (place_id, tag)
select id, 'leans_women'
from places
where slug in (
  'henrietta-hudson', 'cubbyhole', 'gingers-bar',
  'boyfriend-cooperative', 'the-bush-brooklyn', 'gladys-books-and-wine',
  'saint-james-libations', 'the-woods-brooklyn', 'wilkas-sports-bar',
  'maite-bushwick', 'misfit-kava-bar', 'purgatory-brooklyn',
  'cmon-everybody', 'good-judy-brooklyn', 'boobie-trap-brooklyn',
  'pink-metal-brooklyn', 'vals-lesbian-bar', 'marshas-south-street', 'troupe429'
)
on conflict (place_id, tag) do nothing;
