-- Reviewed owner-requested imported duplicates and low-quality personal sublocations.
-- Recoverable archive only. No place or related member row is deleted.
-- Rollback: restore original_record->>'status' by place_id after checking later edits.
create table if not exists place_sublocation_cleanup_20260909 (
  place_id uuid primary key,
  survivor_id uuid,
  original_record jsonb not null,
  reason text not null,
  recorded_at timestamptz not null default now()
);
with reviewed (archive_slug, archive_name, keep_slug, keep_name, reason) as (
  values
    ('public-place-6a033d1b98bf6b3abffcbc0d', 'Bartram’s Garden Trail North', 'public-place-6a034e9a22e2ef47c12db066', 'Bartram’s Garden', 'Reviewed redundant venue/subarea: named parent; 879m from retained record'),
    ('public-place-6a03489974216030f5febc8a', 'Bartram’s Garden Trail South', 'public-place-6a034e9a22e2ef47c12db066', 'Bartram’s Garden', 'Reviewed redundant venue/subarea: named parent; 1057m from retained record'),
    ('public-place-69f2ada6b8bbfa80367313f0', 'Behind LA Fitness.', 'public-place-65635de1d42a82080e0fd653', 'LA Fitness', 'Reviewed redundant venue/subarea: same venue core; 80m from retained record'),
    ('public-place-6945acd624a73292317a44a2', 'Belleville Park inside trails', 'public-place-6868387bd5b814c95d12aa5b', 'Belleville Park', 'Reviewed redundant venue/subarea: named parent; 250m from retained record'),
    ('public-place-6876de68afc13975dd95cd6f', 'Bethpage state park', 'public-place-66d608cebaf8eff3c955075c', 'Bethpage state park', 'Reviewed redundant venue/subarea: same name; 1536m from retained record'),
    ('public-place-652446b71ef1456aff4fcc18', 'Bronx River Park Trail', 'public-place-64f8c2268b25a0548ec62b98', 'Bronx River Park', 'Reviewed redundant venue/subarea: same venue core; 2434m from retained record'),
    ('public-place-645ffacd7fc7e6956b704c17', 'Bronx river trail', 'public-place-5d50ef947cf5d82164f5721b', 'Bronx River Park', 'Reviewed redundant venue/subarea: same venue core; 2246m from retained record'),
    ('public-place-68c1ee85140f9fcd760ebfd2', 'Central Park. Path at pond btwn 5th/6th', 'public-place-69cb21d2f1850cde508caeaa', 'Central Park', 'Reviewed redundant venue/subarea: named parent; 1432m from retained record'),
    ('public-place-630e733b50ea64010d24507f', 'Chester park trail', 'public-place-60da0b3edae37f11349550f5', 'Chester park', 'Reviewed redundant venue/subarea: same venue core; 806m from retained record'),
    ('public-place-65997647e8c406930bd29baf', 'Easton Walmart Back Bathroom', 'public-place-659977a5e8c406930bd34a71', 'Walmart Back Bathroom', 'Reviewed redundant venue/subarea: named parent; 0m from retained record'),
    ('public-place-5afcef31b614622fed3c2790', 'Fort Tilden Park Trails', 'public-place-613751d6e189c80575365ee8', 'Fort Tilden paths', 'Reviewed redundant venue/subarea: same venue core; 475m from retained record'),
    ('public-place-646d0a3a0e9bbb81f76eb6fe', 'Green lane park - trail head', 'public-place-63f7a545abb104001cdda80d', 'Green Lane Park.', 'Reviewed redundant venue/subarea: named parent; 1395m from retained record'),
    ('public-place-64f11fb874e5eac80c48fc33', 'Highland woodsy Part', 'public-place-64b8bb1f41f31ff4be32a2ec', 'Highland park', 'Reviewed redundant venue/subarea: same venue core; 211m from retained record'),
    ('public-place-60f20faaea526e3ba094a36b', 'Home depot parking lot', 'public-place-683b07461e27323907d93fb3', 'Home depot', 'Reviewed redundant venue/subarea: same venue core; 165m from retained record'),
    ('public-place-66281fa6cb70592e99e57fb8', 'Home Depot Restroom', 'public-place-68014a5094ca57539b5100de', 'Home Depot', 'Reviewed redundant venue/subarea: same venue core; 454m from retained record'),
    ('public-place-649c5cfb9bb14eb6d3d92e81', 'Home Depot restroom Concordville', 'public-place-69863c07c555163e27a9bdee', 'Home Depot restroom', 'Reviewed redundant venue/subarea: named parent; 213m from retained record'),
    ('public-place-61128e47b1a07a3912b0d074', 'Horse trailer lot EvansBurg state park', 'public-place-65eb2c791d06fbc993c23afd', 'Evansburg Park', 'Reviewed redundant venue/subarea: named parent; 1743m from retained record'),
    ('public-place-669055262e2c778ccfc94d5f', 'Industry bathrooms', 'public-place-64485a420768f0ec4ec3bc5f', 'Industry city', 'Reviewed redundant venue/subarea: same venue core; 65m from retained record'),
    ('public-place-67ead6c938f225dd9108a100', 'LGA gate 75 bathrooms', 'public-place-6091942ea9248c2a62fc2210', 'LGA', 'Reviewed redundant venue/subarea: named parent; 480m from retained record'),
    ('public-place-6557aeaaf6a438630cf6b8ef', 'Macys 3rd floor bathroom', 'public-place-68e2b3cbaa57de00854bf495', 'Macys Bathroom', 'Reviewed redundant venue/subarea: named parent; 31m from retained record'),
    ('public-place-638cc9c21913b9001da603a5', 'Naugatuck Walmart Back Bathroom', 'public-place-66378d81174af21b5ff4b724', 'Walmart Naugatuck', 'Reviewed redundant venue/subarea: named parent; 194m from retained record'),
    ('public-place-690fd215d6b620713a393b00', 'Newburgh Mall Back Parking Lot', 'public-place-670ac7b70e7702f3aa0e4ad6', 'Newburgh Mall Restroom', 'Reviewed redundant venue/subarea: same venue core; 67m from retained record'),
    ('public-place-6732650247364377ff41fe07', 'Newton Lake Woods', 'public-place-636e61d8ce297a001c6517dd', 'Newton lake park', 'Reviewed redundant venue/subarea: same venue core; 178m from retained record'),
    ('public-place-62cb32cd090912001ea91915', 'Parking Lot @ Springfield Mall', 'public-place-641c95ecea360da3a71e48cb', 'SPRINGFIELD MALL Bathroom', 'Reviewed redundant venue/subarea: same venue core; 228m from retained record'),
    ('public-place-688ea9136afb248b60107034', 'Pelham Bay Park Woods', 'public-place-68274d571b0700ebbe3bb351', 'Pelham Bay park', 'Reviewed redundant venue/subarea: same venue core; 512m from retained record'),
    ('public-place-629a5ee15a2cb00a97c30a39', 'PennyPack Park', 'public-place-671fff03fcea6cf09d74955f', 'Pennypack Park', 'Reviewed redundant venue/subarea: same name; 1731m from retained record'),
    ('public-place-66eb4253ac670ba3a4f5d567', 'Pennypack trails', 'public-place-671fff03fcea6cf09d74955f', 'Pennypack Park', 'Reviewed redundant venue/subarea: same venue core; 126m from retained record'),
    ('public-place-5d81ad25ae6cdc296824f3af', 'Pitney Woods', 'public-place-67c4c4bcbaf80e05099fa045', 'Pitney park', 'Reviewed redundant venue/subarea: same venue core; 196m from retained record'),
    ('public-place-6a1890f52fab1772ba4f8d93', 'QCM 2nd fl bathrooms', 'public-place-60bd2ae6a0e05c6222e4e944', 'QCM bathrooms', 'Reviewed redundant venue/subarea: named parent; 12m from retained record'),
    ('public-place-661aecd1e7f5c848fc3a4133', 'Ridley Creek Park Restroom', 'public-place-64ea5c2849ca98ec5a84cc85', 'Ridley Park Restroom', 'Reviewed redundant venue/subarea: named parent; 38m from retained record'),
    ('public-place-60d506f89b960910dc339bee', 'Robert moses field 5 showers', 'public-place-625d608c1691983aedb7e7fa', 'Robert Moses Field 5', 'Reviewed redundant venue/subarea: same venue core; 185m from retained record'),
    ('public-place-65344262877420da98a1ef8f', 'Second part of Stacy Park', 'public-place-60cc9b3de6cc6543fe6161d8', 'Stacy park', 'Reviewed redundant venue/subarea: named parent; 1393m from retained record'),
    ('public-place-69b8cbb3408a48fa2d3b8a7f', 'Soundview park', 'public-place-5ffb341307160f3c3572e453', 'Soundview Park', 'Reviewed redundant venue/subarea: same name; 1570m from retained record'),
    ('public-place-6136827e86b12505845999b8', 'Soundview Park Trails', 'public-place-5ffb341307160f3c3572e453', 'Soundview Park', 'Reviewed redundant venue/subarea: same venue core; 613m from retained record'),
    ('public-place-65195d0c8ae7c6dfe56bb564', 'Steam Room LA Fitness', 'public-place-68f2c7bc682bc0aa991bd3f5', 'La fitness', 'Reviewed redundant venue/subarea: named parent; 76m from retained record'),
    ('public-place-699797f60d32ceed4d82da7e', 'The Home Depot parking lot & Men’s Room', 'public-place-68043867681de9e0a7248187', 'Home Depot parking lot', 'Reviewed redundant venue/subarea: same venue core; 50m from retained record'),
    ('public-place-5bf2ff86c793fa420166ded3', 'Washington Lake Park', 'public-place-6137567257610205d840fb77', 'Washington lake park', 'Reviewed redundant venue/subarea: same name; 1157m from retained record'),
    ('public-place-6a2b40aabb11af95bb80d145', 'Yankee Stadium', 'osm-way-24801630', 'Yankee Stadium', 'Reviewed redundant venue/subarea: same name; 194m from retained record'),
    ('public-place-63af66aa803a57001d843bef', 'YMCA New Britain - Men’s Health Center', 'osm-way-943605200', 'New Britain YMCA', 'Reviewed redundant venue/subarea: named parent; 22m from retained record'),
    ('public-place-68822a4ed29619565b2b0797', 'Lemon creek', 'public-place-6a13511339f27b245a457b1f', 'Lemon Creek Park', 'Alternate imported name for the retained named park'),
    ('public-place-630d33cf2dce5b029bcb6ac9', 'Shirley Chisholm', 'public-place-64a5a1b2c69bf2fd015e2be6', 'Shirley Chisholm Park', 'Alternate imported name for the retained named park'),
    ('public-place-681fa331ca0c9cae1fd2d4d6', 'Twin lakes', 'public-place-67361d6e07a65a6ab2822536', 'Twin Lakes Park', 'Alternate imported name for the retained named park'),
    ('public-place-62b6610b6727c1001edbf087', 'Stonewall Inn', 'stonewall-inn', 'The Stonewall Inn', 'Reviewed duplicate or spelling variant within 8m'),
    ('public-place-5fbd3704fdff6469f6d81359', 'Cooper Pound Park', 'public-place-6101726b27f46e37835774c7', 'Coopers Pond', 'Reviewed duplicate or spelling variant within 130m'),
    ('public-place-62bde9c1fe0604001ddfe32b', 'Neshaminy Mall Parking Lot', 'public-place-66a90bc8c1f125f490052733', 'Neshaminy Mall Men''s room', 'Reviewed duplicate or spelling variant within 430m'),
    ('public-place-5ccad47a6757a5121a7b46fc', 'Greendoor', 'osm-way-205149147', 'The Green Door', 'Reviewed duplicate or spelling variant within 10m'),
    ('public-place-60293a0551dfa8356d782a13', 'Dream Boutique', 'osm-node-6875686017', 'The Dream Boutique', 'Reviewed duplicate or spelling variant within 31m'),
    ('public-place-6345ae1cd26793001c4c5313', 'JC Penny Men’s Fitting Room', 'public-place-62a4bc7144c5db1837c1c751', 'JCpenny upstairs restroom', 'Reviewed duplicate or spelling variant within 152m'),
    ('public-place-67c94e19eb4892047e9875c0', 'Sheets', 'public-place-6a1e977922b1af219a17de9d', 'Sheetz', 'Reviewed duplicate or spelling variant within 59m'),
    ('public-place-657e2e52ff3e74c74b93ccfb', 'Dog park at Morningside Park 115th street', 'public-place-64f10f1efb4cc8f7ff595e27', 'Morningside park', 'Redundant sublocation inside official NYC Parks property M056'),
    ('public-place-64f3536395e8b3fca8ee1c8a', 'Clove Lake Park', 'public-place-64889038644a340fea3ab3e4', 'Clove lakes park', 'Redundant sublocation inside official NYC Parks property R005'),
    ('public-place-67ffddf2c5c9df8f96227dd2', 'Picnic house restrooms', 'public-place-684aa2d1a4bb18a8a3a79a72', 'Prospect park', 'Redundant sublocation inside official NYC Parks property B073'),
    ('public-place-686992f0c304b560b73c1c18', 'Tunnel Prospect Park', 'public-place-684aa2d1a4bb18a8a3a79a72', 'Prospect park', 'Redundant sublocation inside official NYC Parks property B073'),
    ('public-place-69c5dc50dc28a47b5ca1a127', 'Prospect side hill', 'public-place-684aa2d1a4bb18a8a3a79a72', 'Prospect park', 'Redundant sublocation inside official NYC Parks property B073'),
    ('public-place-69b2abbdb203e537e36a1c9d', 'Heckscher Playground Restroom', 'public-place-69cb21d2f1850cde508caeaa', 'Central Park', 'Redundant sublocation inside official NYC Parks property M010'),
    ('public-place-69dce47ec728d514df6938e3', 'Bethesda Restroom', 'public-place-69cb21d2f1850cde508caeaa', 'Central Park', 'Redundant sublocation inside official NYC Parks property M010'),
    ('public-place-6a8859b6a437b57d819ad639', 'Looking Peak 🪨', 'public-place-69cb21d2f1850cde508caeaa', 'Central Park', 'Redundant sublocation inside official NYC Parks property M010'),
    ('public-place-6a885e742e8ffad94e2e905e', 'The Bear Cave 🐻', 'public-place-69cb21d2f1850cde508caeaa', 'Central Park', 'Redundant sublocation inside official NYC Parks property M010'),
    ('public-place-6a7644e44b207c5206dbc2bd', 'Open space in front of Rambles Restroom', 'public-place-69cb21d2f1850cde508caeaa', 'Central Park', 'Redundant sublocation inside official NYC Parks property M010'),
    ('public-place-65ad6ec4e86a33ce0c71b444', 'Highland park on Jamaica ave', 'public-place-64b8bb1f41f31ff4be32a2ec', 'Highland park', 'Redundant street-side Highland Park sublocation'),
    ('public-place-64fa41f361395b5ab9a8f1c7', 'JC Penny 2nd Floor Fitting room', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-696fc19b4cf9c1c3ac031e82', 'Macys Levi’s Fitting rooms', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6869d34b0bfe61c4a070f4fd', 'Journal Square Parking rooftop staircase', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-68b20d362a88b29dcd90e3f3', 'Minerva dead end', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6957fa169910719e3bb5f5fc', 'CUNY LaGuardia Cruising', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-683633bd778812fc1e9a216d', 'Juniper park cruising stall', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6821763c7d9258291b28b710', 'Behind Mazda', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-67eebe8826d97074b2116200', 'Butler Stacks', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-66f07828a960fbf7e0bda006', 'East Rutherford cruising spot', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6901612321a38794c8e9678e', 'Behind the RIVER GARDEN', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-64f6db92c389b49af5e2dc15', 'Steps behind Maple Gardens parking lot', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-669ee5a14f113b5979e7109b', 'Blink Bathroom shower or stall', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-63b4b93ce28519001dd287c0', 'End of victory blvd', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-686ee58fa3d4fa94d73ced69', 'Back of Riverside mall', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-68a0af798bb2f7f8fc3c5328', 'MACYS FITTINGROOM', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-67992fb25757fe52be91b23d', 'Bestbuy Staircase (Garden Ave side)', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-67b63057994c00afd7512c79', 'Chili''s Handicap Stall', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6a5e8f4e5f17a1b7f153c8a1', 'Nordstrom men’s changing room', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-656538a1523dccc3020fbf63', 'FSC Understall', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-688a2bf4e125c1a31d840d85', 'Parking lot next to target /homedpeot behind quick check', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-64c238e070765d627b6e10de', 'abandoned Kmart parking lot', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6887b86bb315a5d47957a146', 'H&M Fitting Room', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-651c9545f5b76e2c6aa6ec9b', 'Back of Lidl parking lot', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-655fb762d2fd3363a83e30c8', 'Behind la fitness', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-612819ac227e3e12fc8290c4', 'Abandoned parking lot next to Home Depot in Fishkill', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-68cf8507c9c7ae9c2cc53e80', 'Staples back lot', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-684041736acc4d2d0a5f9c3a', 'Side Lot, 60 Merritt Blvd', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-65b6f943a248bf88efa46f15', 'Sterling Stacks', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-63c989047a3ee6001c5b58e9', 'Sterling Library Stacks', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-69015350a0403a2370e7e96a', 'End of Corwin', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-68e4fcfe12835d148624e3dc', 'End of Corwin lane', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-66c569e3eaec2cc83035a05b', 'Lot behind Walmart', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-68ade7583616a5b47a1cc8d9', 'Behind the Art museum', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-688d8d274d2919529d36b526', 'Avandale park and ride behind fence in woods', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6a400d6e22bdeb9722d762d8', 'End of bay lane', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6073e7e34e97222625bd79bd', 'Alley Behind planet fitness', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue'),
    ('public-place-6733dffe7ea43390f345fd6f', 'Side parking lot behind planet fitness Ridley', NULL, NULL, 'Reviewed low-quality imported personal micro-location, not a named public venue')
), backed_up as (
  insert into place_sublocation_cleanup_20260909 (place_id, survivor_id, original_record, reason)
  select p.id, kept.id, to_jsonb(p), reviewed.reason
  from reviewed
  join places p on p.slug = reviewed.archive_slug and p.name = reviewed.archive_name
  left join places kept on kept.slug = reviewed.keep_slug and kept.name = reviewed.keep_name and kept.status = 'published'
  where p.status = 'published'
    and (reviewed.keep_slug is null or kept.id is not null)
    and p.source_kind = 'community' and p.slug ~ '^public-place-[a-f0-9]{24}$'
    and coalesce(p.description, '') = '' and coalesce(p.access_instructions, '') = ''
    and p.verified_at is null
  on conflict (place_id) do nothing
  returning place_id
)
update places p set status = 'archived', updated_at = now()
from backed_up saved where p.id = saved.place_id and p.status = 'published';
