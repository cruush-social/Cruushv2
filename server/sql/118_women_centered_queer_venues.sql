-- Fixed-address queer and women-centered venues found through current public sources.
-- They use ordinary Spot categories and do not expose a separate audience label.
insert into places (
  id, slug, name, description, latitude, longitude, address, facility_type,
  status, source_kind, source_url, source_attribution, verified_at
)
values
  ('11800000-0000-4000-8000-000000000001', 'boyfriend-cooperative', 'Boyfriend Cooperative', 'Queer worker-owned cafe and cocktail bar.', 40.6971695, -73.9346857, '1157 Myrtle Avenue, Brooklyn, NY 11206', 'cafe', 'published', 'official', 'https://boyfriend.coop/', 'Boyfriend Cooperative; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000002', 'the-bush-brooklyn', 'The Bush', 'Queer community bar.', 40.7051652, -73.9242897, '333 Troutman Street, Store 4, Brooklyn, NY 11237', 'bar', 'published', 'official', 'https://www.bushbk.com/', 'The Bush; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000003', 'gladys-books-and-wine', 'Gladys Books & Wine', 'Bookstore, cafe, wine bar, and community gathering space.', 40.6823764, -73.9291790, '306 Malcolm X Boulevard, Brooklyn, NY 11233', 'community_space', 'published', 'official', 'https://www.gladysbooksandwine.com/pages/visit-us', 'Gladys Books & Wine; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000004', 'saint-james-libations', 'Saint James Libations', 'Queer Black woman-owned wine bar and cultural gathering space.', 40.7017370, -73.9195609, '269 Stanhope Street, Brooklyn, NY 11237', 'bar', 'published', 'official', 'https://saintjameslibations.com/', 'Saint James Libations; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000005', 'the-woods-brooklyn', 'The Woods', 'Bar and event space.', 40.7129071, -73.9663175, '48 South 4th Street, Brooklyn, NY 11211', 'bar', 'published', 'official', 'https://www.thewoodsbk.com/', 'The Woods; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000006', 'wilkas-sports-bar', 'Wilka''s Sports Bar', 'Women-owned sports bar focused on women''s sports.', 40.7224757, -73.9927927, '241 Bowery, New York, NY 10002', 'bar', 'published', 'official', 'https://www.wilkasnyc.com/', 'Wilka''s Sports Bar; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000007', 'maite-bushwick', 'Maite', 'Women-owned restaurant and bar.', 40.6991638, -73.9268110, '159 Central Avenue, Brooklyn, NY 11221', 'cafe', 'published', 'official', 'https://www.maitebushwick.com/', 'Maite; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000008', 'misfit-kava-bar', 'Misfit Kava Bar', 'Queer Latina-owned alcohol-free kava bar.', 40.7007347, -73.9301861, '82 Central Avenue, Brooklyn, NY 11206', 'cafe', 'published', 'official', 'https://www.instagram.com/misfitkavabar/', 'Misfit Kava Bar; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000009', 'purgatory-brooklyn', 'Purgatory', 'Queer- and women-owned bar and event space.', 40.6872342, -73.9057388, '675 Central Avenue, Brooklyn, NY 11207', 'bar', 'published', 'official', 'https://www.purgatorybk.com/', 'Purgatory; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000010', 'cmon-everybody', 'C''mon Everybody', 'Queer bar and live performance venue.', 40.6883062, -73.9568248, '325 Franklin Avenue, Brooklyn, NY 11216', 'nightclub', 'published', 'official', 'https://www.cmoneverybody.com/', 'C''mon Everybody; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000011', 'good-judy-brooklyn', 'Good Judy', 'Queer neighborhood bar and event space.', 40.6652417, -73.9892672, '563 5th Avenue, Brooklyn, NY 11215', 'bar', 'published', 'official', 'https://www.instagram.com/goodjudybk/', 'Good Judy; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000012', 'boobie-trap-brooklyn', 'Boobie Trap', 'Women-owned neighborhood bar.', 40.7001545, -73.9160836, '308 Bleecker Street, Brooklyn, NY 11237', 'bar', 'published', 'official', 'https://boobietrapbrooklyn.com/', 'Boobie Trap; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000013', 'pink-metal-brooklyn', 'Pink Metal', 'Women-owned LGBTQ-friendly bar and performance space.', 40.7072538, -73.9395257, '253 Bushwick Avenue, Brooklyn, NY 11206', 'bar', 'published', 'official', 'https://www.pinkmetalbk.com/', 'Pink Metal; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000014', 'vals-lesbian-bar', 'Val''s Lesbian Bar', 'Queer community bar.', 39.9411836, -75.1475438, '605 South 3rd Street, Philadelphia, PA 19147', 'bar', 'published', 'official', 'https://valslesbianbar.com/location.html', 'Val''s Lesbian Bar; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000015', 'marshas-south-street', 'Marsha''s South Street', 'Queer women''s sports bar.', 39.9416796, -75.1503534, '430 South Street, Philadelphia, PA 19147', 'bar', 'published', 'official', 'https://www.marshassouthstreet.com/contact', 'Marsha''s South Street; coordinates © OpenStreetMap contributors', now()),
  ('11800000-0000-4000-8000-000000000016', 'troupe429', 'Troupe429', 'Queer bar and performance venue.', 41.1087040, -73.3961110, '41 North Bridge Street, Norwalk, CT 06854', 'nightclub', 'published', 'official', 'https://www.troupe429.com/siren', 'Troupe429; coordinates © OpenStreetMap contributors', now())
on conflict (id) do nothing;

-- Use the venue's public name; cooperative describes its ownership.
-- Official source: https://www.boyfriend.coop/about/ (verified 2026-09-10).
-- Preserve later edits by changing only the original seeded display name.
update places
set name = 'Boyfriend'
where id = '11800000-0000-4000-8000-000000000001'
  and name = 'Boyfriend Cooperative';
