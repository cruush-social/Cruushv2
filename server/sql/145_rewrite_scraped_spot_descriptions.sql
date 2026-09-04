-- The Spot import carried personal ads written in the first person, complete
-- with typos, degrading self-description, and in one case a member's phone
-- number. A Spot description should describe the place, not advertise a person,
-- so each of these is rewritten as a neutral description of the venue.
--
-- Rows are addressed by id and only overwritten when they still hold the
-- imported text, so a replay cannot undo a later human edit.
update places set description = 'Cruising happens in the restrooms. Regulars use a nod rather than conversation.'
where id = '9c3f958e-6b06-52be-81a5-59bb526397f3' and description like 'Look for a brown hoodie%';

update places set description = 'Park under the Fahy bridge with trails and screened areas. Busy on weekdays and weekends, with a mixed crowd. Discretion is the local norm.'
where id = '0a9bb32c-c28a-5889-bf5b-55caa066c143' and description like 'Located under Fahy bridge%';

update places set description = 'Store restrooms with cruising traffic, mostly from trade passing through.'
where id = 'ad9e27af-3b86-5b37-a692-988c9316a64a' and description like 'Hot straight contractors%';

update places set description = 'Airport cell phone waiting lot with cruising traffic between pickups.'
where id = '97f893e3-b9b3-5fd8-b47c-79e468a00c59' and description like 'Can often find guys%';

update places set description = 'Store restrooms with understall cruising traffic.'
where id = '399f9c02-3b67-5d3d-a9c0-48cda4e3db6d' and description like 'Great mix of construction%';

update places set description = 'Car park used for cruising. Traffic is steady and mostly stays in the cars.'
where id = 'b4e74783-366e-5f69-8b4f-5477a31637c1' and description like 'Good place to park up%';

update places set description = 'State park with wooded trails and cruising traffic.'
where id = 'a91d56a5-2871-53d2-979a-f97fcb799a71' and description like 'Looking for big white%';

update places set description = 'Alley with three benches. Sitting and crossing your legs reads as available locally. Busiest after the bars close.'
where id = '415d16ef-82af-54f1-a635-d015e872ded4' and description like 'There are 3 benches%';

update places set description = 'Airport lounge with occasional cruising traffic.'
where id = '77055602-b658-5a65-ba63-d19e9627fe4f' and description like 'Always looking for a little fun%';

update places set description = 'Two adjacent parking lots that are easy to move between, used for meeting up.'
where id = '69d83151-9631-51b0-99cf-dc807addb467' and description like 'Easy to maneuver%';

update places set description = 'Open rock cave east of Pride Rock, in the middle of The Ramble. The winding muddy path to it carries heavy evening cruising traffic. Keep moving and let the traffic flow rather than letting a crowd gather.'
where id = '37fc489a-1606-5f23-94ed-a832d6b327d1' and description like 'This open rock cave%';

update places set description = 'Highway rest stop with restroom cruising traffic, busiest late at night.'
where id = '9a117134-7bf9-59f7-9041-31cff211278b' and description like 'total submissive%';

update places set description = 'Park restroom with cruising traffic, plus cars parked along the park roads.'
where id = 'e4321858-e4b7-54a6-8953-33cc8e8b2e04' and description like 'Men%s room in park%';

update places set description = 'Stadium car park. Traffic picks up after 1am on weeknights.'
where id = '4ba808af-be20-58ad-84ec-71e2577db6c1' and description like 'Better after 1am%';

update places set description = 'Street corner with cruising traffic. Contact is made by signal rather than conversation.'
where id = 'a75680ec-8404-5e02-919d-8c1c0b8980df' and description like 'Guys cruising looking%';

update places set description = 'Cruising spot under the overpass.'
where id = '6c23387c-640d-5c07-974f-a8c03dcd2354' and description like 'Cruising spot under the overpass, s%';

update places set description = 'Pier with a wooded area alongside it. Cruising traffic after dark, with plenty of cover.'
where id = '3fe27489-30a7-5910-8378-c855dfcc398d' and description like 'When Datk%';

update places set description = 'Park with trails and screened areas used for cruising.'
where id = '7227a15a-2be1-5806-8110-ad7b810e7a93' and description like 'Good park for play%';
