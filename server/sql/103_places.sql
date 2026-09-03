create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text check (address is null or char_length(address) <= 300),
  facility_type text not null check (facility_type in (
    'clinic', 'bar', 'nightclub', 'community_space', 'park', 'restroom',
    'sauna', 'gym', 'hotel', 'dungeon', 'venue', 'cafe', 'shop', 'library',
    'staircase', 'trail', 'transit', 'parking', 'beach', 'adult_venue', 'other'
  )),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'archived')),
  source_kind text not null default 'community' check (source_kind in ('official', 'open_data', 'community')),
  source_url text,
  source_attribution text,
  submitted_by uuid references app_users(id) on delete set null,
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  verified_at timestamptz,
  suggestion_count integer not null default 1 check (suggestion_count >= 1),
  auto_shortlisted_at timestamptz,
  suggestion_ciphertext text,
  suggestion_nonce text,
  suggestion_auth_tag text,
  suggestion_key_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table places
  add column if not exists suggestion_count integer not null default 1,
  add column if not exists auto_shortlisted_at timestamptz,
  add column if not exists suggestion_ciphertext text,
  add column if not exists suggestion_nonce text,
  add column if not exists suggestion_auth_tag text,
  add column if not exists suggestion_key_version text;

-- Migrations replay on every boot, so this list has to accept the facility
-- types later migrations introduce as well. Narrowing it here would reject
-- rows those migrations already inserted.
alter table places drop constraint if exists places_facility_type_check;
alter table places add constraint places_facility_type_check check (facility_type in (
  'clinic', 'bar', 'nightclub', 'community_space', 'park', 'restroom',
  'sauna', 'gym', 'hotel', 'dungeon', 'venue', 'cafe', 'shop', 'library',
  'staircase', 'trail', 'transit', 'parking', 'beach', 'adult_venue',
  'adult_shop', 'music_venue', 'sports_venue', 'other'
));

create index if not exists idx_places_status_location on places (status, latitude, longitude);
create index if not exists idx_places_name on places (lower(name));
create index if not exists idx_places_pending_shortlist
  on places (auto_shortlisted_at desc nulls last, suggestion_count desc, created_at asc)
  where status = 'pending';

create table if not exists place_suggestions (
  place_id uuid not null references places(id) on delete cascade,
  supporter_token text not null,
  created_at timestamptz not null default now(),
  primary key (place_id, supporter_token)
);

alter table place_suggestions add column if not exists supporter_token text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'place_suggestions' and column_name = 'user_id'
  ) then
    execute 'update place_suggestions set supporter_token = encode(digest(place_id::text || user_id::text, ''sha256''), ''hex'') where supporter_token is null';
    alter table place_suggestions drop constraint if exists place_suggestions_pkey;
    alter table place_suggestions drop column user_id;
    alter table place_suggestions add primary key (place_id, supporter_token);
  end if;
end $$;

alter table place_suggestions alter column supporter_token set not null;

create table if not exists place_tags (
  place_id uuid not null references places(id) on delete cascade,
  tag text not null check (tag in (
    'lgbtq_health', 'womens_health', 'sexual_health', 'leans_men',
    'leans_women', 't4t_spot', 'techno_club'
  )),
  primary key (place_id, tag)
);

-- Older installations may still have the pre-1.6 tag constraint, while a
-- replay after 1.6 has the new one. Keep this migration compatible with both;
-- 104 normalizes legacy values and installs the final public taxonomy.
alter table place_tags drop constraint if exists place_tags_tag_check;
alter table place_tags add constraint place_tags_tag_check check (tag in (
  'lgbtq_health', 'womens_health', 'sexual_health', 'gay_spot',
  'dyke_spot', 'dyke_bar', 'leans_men', 'leans_women', 't4t_spot', 'techno_club'
));

create table if not exists place_board_messages (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  content text not null default '[encrypted]',
  content_ciphertext text not null,
  content_nonce text not null,
  content_auth_tag text not null,
  content_key_version text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (expires_at > created_at)
);

create index if not exists idx_place_board_messages_place_created
  on place_board_messages (place_id, created_at desc);
create index if not exists idx_place_board_messages_expires
  on place_board_messages (expires_at);

create table if not exists place_checkins (
  user_id uuid primary key references app_users(id) on delete cascade,
  place_id uuid not null references places(id) on delete cascade,
  visible boolean not null default false,
  checked_in_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  check (expires_at > checked_in_at)
);

create index if not exists idx_place_checkins_place_active
  on place_checkins (place_id, expires_at desc);

create table if not exists place_checkin_events (
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  bucket_start timestamptz not null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (place_id, user_id, bucket_start)
);

create index if not exists idx_place_checkin_events_expires
  on place_checkin_events (expires_at);

create table if not exists place_activity_hourly (
  place_id uuid not null references places(id) on delete cascade,
  bucket_start timestamptz not null,
  checkin_count integer not null default 0 check (checkin_count >= 0),
  primary key (place_id, bucket_start)
);

create index if not exists idx_place_activity_hourly_retention
  on place_activity_hourly (bucket_start);

create table if not exists place_ratings (
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  category text not null check (category in ('overall', 'gender_inclusivity', 'lgbtq_friendliness', 'safety', 'accessibility', 'cleanliness')),
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id, category)
);

alter table reports
  add column if not exists place_id uuid references places(id) on delete set null,
  add column if not exists place_board_message_id uuid references place_board_messages(id) on delete set null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'reports_target_type_check' and conrelid = 'reports'::regclass) then
    alter table reports drop constraint reports_target_type_check;
  end if;
  if exists (select 1 from pg_constraint where conname = 'reports_target_required_check' and conrelid = 'reports'::regclass) then
    alter table reports drop constraint reports_target_required_check;
  end if;
end $$;

alter table reports
  add constraint reports_target_type_check
  check (target_type in ('user', 'profile', 'conversation', 'message', 'post', 'profile_photo', 'place', 'place_message'));

alter table reports
  add constraint reports_target_required_check
  check (
    (target_account_deleted_at is not null and target_user_id is null and (target_type <> 'profile_photo' or profile_photo_url is null))
    or
    (target_account_deleted_at is null and (
      (target_type = 'user' and target_user_id is not null)
      or (target_type = 'profile' and target_user_id is not null)
      or (target_type = 'conversation' and conversation_id is not null)
      or (target_type = 'message' and message_id is not null)
      or (target_type = 'post' and post_id is not null)
      or (target_type = 'profile_photo' and target_user_id is not null and (nullif(profile_photo_url, '') is not null or media_object_id is not null))
      or (target_type = 'place' and place_id is not null)
      or (target_type = 'place_message' and place_board_message_id is not null and target_user_id is not null)
    ))
  );

create index if not exists idx_reports_place_id on reports (place_id, created_at desc) where place_id is not null;
create index if not exists idx_reports_place_board_message_id on reports (place_board_message_id, created_at desc) where place_board_message_id is not null;

insert into places (
  id, slug, name, description, latitude, longitude, address, facility_type,
  status, source_kind, source_url, source_attribution, verified_at
)
values
  ('10000000-0000-4000-8000-000000000001', 'callen-lorde-chelsea', 'Callen-Lorde Chelsea', 'LGBTQ community health center.', 40.7430568, -74.0031835, '356 West 18th Street, New York, NY 10011', 'clinic', 'published', 'official', 'https://callen-lorde.org/contact/', 'Callen-Lorde; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000002', 'callen-lorde-bronx', 'Callen-Lorde Bronx', 'LGBTQ community health center.', 40.8222238, -73.9105585, '3144 3rd Avenue, Bronx, NY 10451', 'clinic', 'published', 'official', 'https://callen-lorde.org/contact/', 'Callen-Lorde; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000003', 'callen-lorde-brooklyn', 'Callen-Lorde Brooklyn', 'LGBTQ community health center.', 40.6913775, -73.9823921, '40 Flatbush Avenue Extension, Brooklyn, NY 11201', 'clinic', 'published', 'official', 'https://callen-lorde.org/contact/', 'Callen-Lorde; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000004', 'chelsea-sexual-health-clinic', 'Chelsea Sexual Health Clinic', 'NYC Health sexual health clinic.', 40.7495831, -73.9998111, '303 9th Avenue, New York, NY 10001', 'clinic', 'published', 'official', 'https://www.nyc.gov/site/doh/services/sexual-health-clinics.page', 'NYC Health; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000005', 'fort-greene-sexual-health-clinic', 'Fort Greene Sexual Health Clinic', 'NYC Health sexual health clinic.', 40.6918117, -73.9820476, '295 Flatbush Avenue Extension, Brooklyn, NY 11201', 'clinic', 'published', 'official', 'https://www.nyc.gov/site/doh/services/sexual-health-clinics.page', 'NYC Health; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000006', 'central-harlem-sexual-health-clinic', 'Central Harlem Sexual Health Clinic', 'NYC Health sexual health clinic.', 40.8138484, -73.9370732, '2238 Fifth Avenue, New York, NY 10037', 'clinic', 'published', 'official', 'https://www.nyc.gov/site/doh/services/sexual-health-clinics.page', 'NYC Health; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000007', 'corona-sexual-health-clinic', 'Corona Sexual Health Clinic', 'NYC Health sexual health clinic.', 40.7559327, -73.8731831, '34-33 Junction Boulevard, Queens, NY 11372', 'clinic', 'published', 'official', 'https://www.nyc.gov/site/doh/services/sexual-health-clinics.page', 'NYC Health; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000008', 'jamaica-sexual-health-clinic', 'Jamaica Sexual Health Clinic', 'NYC Health sexual health clinic.', 40.7160878, -73.8078829, '90-37 Parsons Boulevard, Queens, NY 11432', 'clinic', 'published', 'official', 'https://www.nyc.gov/site/doh/services/sexual-health-clinics.page', 'NYC Health; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000009', 'morrisania-sexual-health-clinic', 'Morrisania Sexual Health Clinic', 'NYC Health sexual health clinic.', 40.8327518, -73.9034601, '1309 Fulton Avenue, Bronx, NY 10456', 'clinic', 'published', 'official', 'https://www.nyc.gov/site/doh/services/sexual-health-clinics.page', 'NYC Health; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000010', 'henrietta-hudson', 'Henrietta Hudson', 'Queer bar built by dykes.', 40.7310628, -74.0065268, '438 Hudson Street, New York, NY 10014', 'bar', 'published', 'official', 'https://www.henriettahudson.com/', 'Henrietta Hudson; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000011', 'cubbyhole', 'Cubbyhole', 'Queer neighborhood bar.', 40.7376427, -74.0037475, '281 West 12th Street, New York, NY 10014', 'bar', 'published', 'official', 'https://www.cubbyholebar.com/', 'Cubbyhole; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000012', 'gingers-bar', 'Ginger''s Bar', 'Brooklyn lesbian bar.', 40.6712936, -73.9842242, '363 5th Avenue, Brooklyn, NY 11215', 'bar', 'published', 'open_data', 'https://www.openstreetmap.org/?mlat=40.6712936&mlon=-73.9842242#map=19/40.6712936/-73.9842242', '© OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000013', 'basement-nyc', 'Basement NYC', 'Techno club at Knockdown Center.', 40.7152945, -73.9136973, '52-19 Flushing Avenue, Maspeth, NY 11378', 'nightclub', 'published', 'official', 'https://basementny.net/', 'Basement NYC; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000014', 'nowadays', 'Nowadays', 'Indoor and outdoor music venue in Ridgewood.', 40.6928669, -73.9016974, '56-06 Cooper Avenue, Ridgewood, NY 11385', 'nightclub', 'published', 'official', 'https://nowadays.nyc/about/', 'Nowadays; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000015', 'knockdown-center', 'Knockdown Center', 'Music and arts venue in Maspeth.', 40.7152788, -73.9136706, '52-19 Flushing Avenue, Maspeth, NY 11378', 'nightclub', 'published', 'official', 'https://knockdown.center/', 'Knockdown Center; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000016', 'public-records', 'Public Records', 'Music venue and community space in Gowanus.', 40.6821674, -73.9863886, '233 Butler Street, Brooklyn, NY 11217', 'nightclub', 'published', 'official', 'https://publicrecords.nyc/', 'Public Records; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000017', 'stonewall-inn', 'The Stonewall Inn', 'Historic LGBTQ bar and community landmark.', 40.7338379, -74.0021637, '53 Christopher Street, New York, NY 10014', 'bar', 'published', 'official', 'https://thestonewallinn.nyc/', 'The Stonewall Inn; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000018', 'metropolitan-bar', 'Metropolitan Bar', 'Brooklyn gay bar.', 40.7136296, -73.9494972, '559 Lorimer Street, Brooklyn, NY 11211', 'bar', 'published', 'official', 'https://metropolitanbar.squarespace.com/', 'Metropolitan Bar; coordinates © OpenStreetMap contributors', now()),
  ('10000000-0000-4000-8000-000000000019', 'three-dollar-bill', '3 Dollar Bill', 'Queer nightclub and event space in Brooklyn.', 40.7083702, -73.9381352, '260 Meserole Street, Brooklyn, NY 11206', 'nightclub', 'published', 'official', 'https://www.3dollarbillbk.com/', '3 Dollar Bill; coordinates © OpenStreetMap contributors', now())
on conflict (id) do nothing;

insert into place_tags (place_id, tag)
select p.id, seed.tag
from (values
  ('callen-lorde-chelsea', 'lgbtq_health'), ('callen-lorde-chelsea', 'sexual_health'),
  ('callen-lorde-bronx', 'lgbtq_health'), ('callen-lorde-bronx', 'sexual_health'),
  ('callen-lorde-brooklyn', 'lgbtq_health'), ('callen-lorde-brooklyn', 'sexual_health'),
  ('chelsea-sexual-health-clinic', 'sexual_health'), ('chelsea-sexual-health-clinic', 'womens_health'),
  ('fort-greene-sexual-health-clinic', 'sexual_health'), ('fort-greene-sexual-health-clinic', 'womens_health'),
  ('central-harlem-sexual-health-clinic', 'sexual_health'), ('central-harlem-sexual-health-clinic', 'womens_health'),
  ('corona-sexual-health-clinic', 'sexual_health'), ('corona-sexual-health-clinic', 'womens_health'),
  ('jamaica-sexual-health-clinic', 'sexual_health'), ('jamaica-sexual-health-clinic', 'womens_health'),
  ('morrisania-sexual-health-clinic', 'sexual_health'), ('morrisania-sexual-health-clinic', 'womens_health'),
  ('henrietta-hudson', 'leans_women'),
  ('cubbyhole', 'leans_women'),
  ('gingers-bar', 'leans_women'),
  ('basement-nyc', 'techno_club'), ('nowadays', 'techno_club'),
  ('knockdown-center', 'techno_club'), ('public-records', 'techno_club'),
  ('stonewall-inn', 'leans_men'), ('metropolitan-bar', 'leans_men'), ('three-dollar-bill', 'leans_men')
) as seed(slug, tag)
join places p on p.slug = seed.slug
on conflict do nothing;

insert into places (
  id, slug, name, description, latitude, longitude, address, facility_type,
  status, source_kind, source_url, source_attribution, verified_at
)
select
  md5('cruush-place:' || seed.slug)::uuid,
  seed.slug,
  seed.name,
  'Planned Parenthood sexual and reproductive healthcare clinic.',
  seed.latitude,
  seed.longitude,
  seed.address,
  'clinic',
  'published',
  'official',
  seed.source_url,
  'Official affiliate directory; coordinates from the U.S. Census Geocoder or OpenStreetMap',
  now()
from (values
  ('planned-parenthood-bronx', 'Planned Parenthood Bronx Health Center', 40.816630476727, -73.919592699671, '349 E 149th Street, Bronx, NY 10451', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/campaigns/care-for-nyc'),
  ('planned-parenthood-brooklyn', 'Planned Parenthood Joan Malin Brooklyn Health Center', 40.692620433941, -73.991018506795, '44 Court Street, Brooklyn, NY 11201', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/campaigns/care-for-nyc'),
  ('planned-parenthood-queens', 'Planned Parenthood Diane L. Max Health Center', 40.746541927304, -73.946862525745, '21-41 45th Road, Queens, NY 11101', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/campaigns/care-for-nyc'),
  ('planned-parenthood-hempstead', 'Planned Parenthood Hempstead Health Center', 40.710588190370, -73.612981527748, '540 Fulton Avenue, Hempstead, NY 11550', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/get-care/locations-and-hours'),
  ('planned-parenthood-massapequa', 'Planned Parenthood Massapequa Health Center', 40.683325310697, -73.430781145692, '35 Carmans Road, Massapequa, NY 11758', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/get-care/locations-and-hours'),
  ('planned-parenthood-newburgh', 'Planned Parenthood Newburgh Health Center', 41.496455296750, -74.029387092237, '136 Lake Street, Suite 11, Newburgh, NY 12550', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/get-care/locations-and-hours'),
  ('planned-parenthood-poughkeepsie', 'Planned Parenthood Poughkeepsie Health Center', 41.700981666032, -73.929680304046, '17 Noxon Street, Poughkeepsie, NY 12601', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/get-care/locations-and-hours'),
  ('planned-parenthood-kingston', 'Planned Parenthood Kingston Health Center', 41.928785427422, -73.999512912349, '21 Grand Street, Kingston, NY 12401', 'https://www.plannedparenthood.org/planned-parenthood-greater-new-york/get-care/locations-and-hours'),
  ('planned-parenthood-huntington', 'Planned Parenthood Huntington Health Center', 40.859869500798, -73.419814613121, '755 New York Avenue, Huntington, NY 11743', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-patchogue', 'Planned Parenthood Patchogue Health Center', 40.782259356459, -73.036936489423, '450 Waverly Avenue, Patchogue, NY 11772', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-smithtown', 'Planned Parenthood Smithtown Health Center', 40.854184036593, -73.197306063634, '70 Maple Avenue, Smithtown, NY 11787', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-riverhead', 'Planned Parenthood Riverhead Health Center', 40.919329184161, -72.655427836205, '550 East Main Street, Riverhead, NY 11901', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-west-islip', 'Planned Parenthood West Islip Health Center', 40.718439600000, -73.306333400000, '180 Sunrise Highway, West Islip, NY 11795', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-mount-vernon', 'Planned Parenthood Mount Vernon Health Center', 40.912307418930, -73.837358034627, '6 Gramatan Avenue, Mount Vernon, NY 10550', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-new-rochelle', 'Planned Parenthood New Rochelle Health Center', 40.913097408198, -73.791744112441, '150 Lockwood Avenue, New Rochelle, NY 10801', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-white-plains', 'Planned Parenthood White Plains Health Center', 41.039468714567, -73.783805362981, '175 Tarrytown Road, White Plains, NY 10607', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-yonkers', 'Planned Parenthood Yonkers Health Center', 40.933228505982, -73.898532666002, '20 South Broadway, Yonkers, NY 10701', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-spring-valley', 'Planned Parenthood Spring Valley Health Center', 41.105245074740, -74.031223823677, '25 Perlman Drive, Spring Valley, NY 10977', 'https://www.plannedparenthood.org/planned-parenthood-hudson-peconic/contact-us'),
  ('planned-parenthood-absecon', 'Planned Parenthood Absecon Health Center', 39.426029669857, -74.505383359698, '320 Ohio Avenue, Absecon, NJ 08201', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-camden', 'Planned Parenthood Camden Health Center', 39.941389234158, -75.119353782365, '317 Broadway, Camden, NJ 08103', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-delran', 'Planned Parenthood Delran Health Center', 40.022269368438, -74.941328199447, '8008 Route 130 North, Delran, NJ 08075', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-elizabeth', 'Planned Parenthood Elizabeth Health Center', 40.662159064590, -74.214122943880, '1171 Elizabeth Avenue, Elizabeth, NJ 07201', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-flemington', 'Planned Parenthood Flemington Health Center', 40.546675251365, -74.856560554607, '349 Route 31 South, Flemington, NJ 08822', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-franklin', 'Planned Parenthood Franklin Health Center', 40.471384932988, -74.492719357619, '1323 Route 27, Somerset, NJ 08873', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-hackensack', 'Planned Parenthood Hackensack Health Center', 40.897292552629, -74.040155897752, '575 Main Street, Hackensack, NJ 07601', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-hamilton', 'Planned Parenthood Hamilton Health Center', 40.221353444528, -74.636909950599, '2279 State Highway 33, Hamilton Square, NJ 08690', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-morristown', 'Planned Parenthood Morristown Health Center', 40.805861242315, -74.482674588054, '196 Speedwell Avenue, Morristown, NJ 07960', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-newton', 'Planned Parenthood Newton Health Center', 41.057985697793, -74.751505039065, '8 Moran Street, Newton, NJ 07860', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-perth-amboy', 'Planned Parenthood Perth Amboy Health Center', 40.511056619013, -74.282905875038, '450 Market Street, Perth Amboy, NJ 08861', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-shrewsbury', 'Planned Parenthood Shrewsbury Health Center', 40.338006608135, -74.066576942508, '69 East Newman Springs Road, Shrewsbury, NJ 07702', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-trenton', 'Planned Parenthood Trenton Health Center', 40.220940071901, -74.756334241487, '437 East State Street, Trenton, NJ 08608', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-washington-nj', 'Planned Parenthood Washington Health Center', 40.758761769395, -74.978210460540, '66 East Washington Avenue, Washington, NJ 07882', 'https://www.plannedparenthood.org/planned-parenthood-northern-central-southern-new-jersey/who-we-are'),
  ('planned-parenthood-east-orange', 'Planned Parenthood East Orange Health Center', 40.761424000000, -74.211497100000, '560 Dr. Martin Luther King Jr. Boulevard, East Orange, NJ 07018', 'https://www.plannedparenthood.org/planned-parenthood-metropolitan-new-jersey'),
  ('planned-parenthood-ironbound', 'Planned Parenthood Ironbound Health Center', 40.730248360571, -74.157640556119, '70 Adams Street, Newark, NJ 07105', 'https://www.plannedparenthood.org/planned-parenthood-metropolitan-new-jersey'),
  ('planned-parenthood-montclair', 'Planned Parenthood Montclair Health Center', 40.815289869513, -74.216500189057, '29 North Fullerton Avenue, Montclair, NJ 07042', 'https://www.plannedparenthood.org/planned-parenthood-metropolitan-new-jersey'),
  ('planned-parenthood-mulberry', 'Planned Parenthood Mulberry Health Center', 40.730720135967, -74.171377164171, '240 Mulberry Street, Newark, NJ 07102', 'https://www.plannedparenthood.org/planned-parenthood-metropolitan-new-jersey'),
  ('planned-parenthood-paterson', 'Planned Parenthood Paterson Health Center', 40.918209033185, -74.145170026072, '680 Broadway, Paterson, NJ 07514', 'https://www.plannedparenthood.org/planned-parenthood-metropolitan-new-jersey'),
  ('planned-parenthood-bridgeport', 'Planned Parenthood Bridgeport Health Center', 41.223395829605, -73.218239419419, '4697 Main Street, Bridgeport, CT 06606', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-danbury', 'Planned Parenthood Danbury Health Center', 41.388018839307, -73.446210860957, '44 Main Street, Danbury, CT 06810', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-meriden', 'Planned Parenthood Meriden Health Center', 41.542228684072, -72.799144569605, '26 Women''s Way, Meriden, CT 06451', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-new-haven', 'Planned Parenthood New Haven Health Center', 41.319672567886, -72.918809317123, '345 Whitney Avenue, New Haven, CT 06511', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-stamford', 'Planned Parenthood Stamford Health Center', 41.066968836421, -73.543737556296, '35 Sixth Street, Stamford, CT 06902', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-torrington', 'Planned Parenthood Torrington Health Center', 41.823535561532, -73.116807303725, '249 Winsted Road, Torrington, CT 06790', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-waterbury', 'Planned Parenthood Waterbury Health Center', 41.568718243722, -73.060914518170, '617 Watertown Avenue, Waterbury, CT 06708', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-west-hartford', 'Planned Parenthood West Hartford Health Center', 41.729973725300, -72.724453263419, '1030 New Britain Avenue, West Hartford, CT 06110', 'https://www.plannedparenthood.org/planned-parenthood-southern-new-england/patient-resources/locations'),
  ('planned-parenthood-center-city', 'Planned Parenthood Center City Philadelphia Health Center', 39.947651593734, -75.160505539271, '1144 Locust Street, Philadelphia, PA 19107', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-castor-avenue', 'Planned Parenthood Castor Avenue Health Center', 40.064827689749, -75.053410184091, '8210 Castor Avenue, Philadelphia, PA 19152', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-media', 'Planned Parenthood Media Health Center', 39.918276871773, -75.392275956253, '216 West State Street, Media, PA 19063', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-norristown', 'Planned Parenthood Norristown Health Center', 40.123067609023, -75.337512880287, '1221 Powell Street, Norristown, PA 19401', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-pottstown', 'Planned Parenthood Pottstown Health Center', 40.244286811548, -75.604125447602, '2081 East High Street, Pottstown, PA 19464', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-upper-darby', 'Planned Parenthood Upper Darby Health Center', 39.959622231746, -75.262961441511, '7200 Chestnut Street, Upper Darby, PA 19082', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-west-chester', 'Planned Parenthood West Chester Health Center', 39.956980606301, -75.610347215670, '8 South Wayne Street, West Chester, PA 19382', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-northeast-philadelphia', 'Planned Parenthood Northeast Philadelphia Health Center', 40.104097561015, -75.000773711993, '2751 Comly Road, Philadelphia, PA 19154', 'https://www.plannedparenthood.org/planned-parenthood-southeastern-pennsylvania/patients/our-health-centers'),
  ('planned-parenthood-allentown', 'Planned Parenthood Allentown Health Center', 40.602157325362, -75.475849893857, '29 North Ninth Street, Allentown, PA 18101', 'https://www.plannedparenthood.org/planned-parenthood-keystone'),
  ('planned-parenthood-bensalem', 'Planned Parenthood Bensalem Health Center', 40.111842998333, -74.937233216992, '2185 Galloway Road, Bensalem, PA 19020', 'https://www.plannedparenthood.org/planned-parenthood-keystone'),
  ('planned-parenthood-warminster', 'Planned Parenthood Warminster Health Center', 40.199737363441, -75.087113459775, '610 Louis Drive, Warminster, PA 18974', 'https://www.plannedparenthood.org/planned-parenthood-keystone'),
  ('planned-parenthood-quakertown', 'Planned Parenthood Quakertown Health Center', 40.441697640069, -75.340934105895, '401 West Broad Street, Quakertown, PA 18951', 'https://www.plannedparenthood.org/planned-parenthood-keystone')
) as seed(slug, name, latitude, longitude, address, source_url)
on conflict (id) do nothing;

insert into place_tags (place_id, tag)
select p.id, tags.tag
from places p
cross join (values ('womens_health'), ('sexual_health')) as tags(tag)
where p.slug like 'planned-parenthood-%'
on conflict do nothing;

insert into places (
  id, slug, name, description, latitude, longitude, address, facility_type,
  status, source_kind, source_url, source_attribution, verified_at
)
select
  md5('cruush-place:' || seed.slug)::uuid,
  seed.slug,
  seed.name,
  seed.description,
  seed.latitude,
  seed.longitude,
  seed.address,
  'clinic',
  'published',
  'official',
  seed.source_url,
  seed.source_attribution,
  now()
from (values
  ('nyc-hh-bellevue-pride-health-center', 'NYC Health + Hospitals/Bellevue Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.739696677918, -73.976402510469, '462 1st Avenue, New York, NY 10016', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('nyc-hh-elmhurst-pride-health-center', 'NYC Health + Hospitals/Elmhurst Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.7449869, -73.8859961, '79-01 Broadway, Elmhurst, NY 11373', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('nyc-hh-gouverneur-pride-health-center', 'NYC Health + Hospitals/Gouverneur Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.712832762688, -73.988418362889, '227 Madison Street, New York, NY 10002', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('nyc-hh-judson-pride-health-center', 'NYC Health + Hospitals/Judson Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.721663534780, -73.995734803620, '34 Spring Street, New York, NY 10012', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('nyc-hh-jacobi-pride-health-center', 'NYC Health + Hospitals/Jacobi Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.857447720384, -73.847645118680, '1400 Pelham Parkway South, Bronx, NY 10461', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('nyc-hh-lincoln-pride-health-center', 'NYC Health + Hospitals/Lincoln Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.817595424208, -73.923799149873, '234 East 149th Street, Bronx, NY 10451', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('nyc-hh-metropolitan-pride-health-center', 'NYC Health + Hospitals/Metropolitan Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.784173660859, -73.944134516784, '1901 1st Avenue, New York, NY 10029', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('nyc-hh-woodhull-pride-health-center', 'NYC Health + Hospitals/Woodhull Pride Health Center', 'LGBTQ-affirming primary and specialty care through NYC Health + Hospitals Pride Health Centers.', 40.700457084778, -73.941587228488, '760 Broadway, Brooklyn, NY 11206', 'https://www.nychealthandhospitals.org/pressrelease/nyc-health-hospitals-the-nyc-unity-project-and-the-nyc-mayors-office-of-equity-racial-justice-launch-community-health-initiative-to-protect-access-to-lgbtq-health-care/', 'NYC Health + Hospitals; coordinates from NYC Health + Hospitals or OpenStreetMap'),
  ('anchor-health-hamden', 'Anchor Health Hamden', 'LGBTQ-centered primary care, sexual health, and gender-affirming care.', 41.3767766, -72.9048342, '2200 Whitney Avenue, Suite 290, Hamden, CT 06518', 'https://anchorhealthct.org/', 'Anchor Health; coordinates from OpenStreetMap'),
  ('anchor-health-stamford', 'Anchor Health Stamford', 'LGBTQ-centered primary care, sexual health, and gender-affirming care.', 41.049850221606, -73.564356028372, '30 Myano Lane, Suite 16, Stamford, CT 06902', 'https://anchorhealthct.org/', 'Anchor Health; coordinates from OpenStreetMap'),
  ('apicha-manhattan', 'Apicha Community Health Center Manhattan', 'LGBTQ-welcoming primary care, sexual health, behavioral health, and OB/GYN services.', 40.718645367912, -74.002434418221, '400 Broadway, New York, NY 10013', 'https://www.apicha.org/locations/manhattan/', 'Apicha Community Health Center; coordinates from the U.S. Census Geocoder'),
  ('apicha-queens', 'Apicha Community Health Center Queens', 'LGBTQ-welcoming primary care, sexual health, behavioral health, OB/GYN, and dental services.', 40.749814909840, -73.884166432295, '82-11 37th Avenue, Jackson Heights, NY 11372', 'https://www.apicha.org/locations/queens/', 'Apicha Community Health Center; coordinates from the U.S. Census Geocoder'),
  ('mazzoni-center-bainbridge', 'Mazzoni Center Bainbridge', 'Comprehensive LGBTQ primary care, behavioral health, and support services.', 39.942623958163, -75.164854431100, '1348 Bainbridge Street, Philadelphia, PA 19147', 'https://www.mazzonicenter.org/about-us/hours-and-locations', 'Mazzoni Center; coordinates from the U.S. Census Geocoder'),
  ('mazzoni-center-washington-west', 'Mazzoni Center Washington West', 'LGBTQ sexual health services and community programs.', 39.947808747855, -75.160850888201, '1201 Locust Street, Philadelphia, PA 19107', 'https://www.mazzonicenter.org/about-us/hours-and-locations', 'Mazzoni Center; coordinates from the U.S. Census Geocoder')
) as seed(slug, name, description, latitude, longitude, address, source_url, source_attribution)
on conflict (id) do nothing;

insert into place_tags (place_id, tag)
select p.id, tags.tag
from places p
cross join (values ('lgbtq_health'), ('sexual_health')) as tags(tag)
where p.slug like 'nyc-hh-%-pride-health-center'
   or p.slug like 'anchor-health-%'
   or p.slug like 'apicha-%'
   or p.slug like 'mazzoni-center-%'
on conflict do nothing;
