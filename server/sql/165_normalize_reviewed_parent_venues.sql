-- Parent venues identified by the manual September 12 map review.
-- Preserve each retained place id, member references, and the complete original.
create table if not exists place_parent_cleanup_20260912 (
  place_id uuid primary key,
  original_record jsonb not null,
  name text not null,
  facility_type text not null,
  reason text not null,
  recorded_at timestamptz not null default now()
);

with reviewed(slug, name, facility_type, reason) as (values
  ('public-place-64d35c0ae7644671dadb5c27', 'Brooklyn Bridge Park', 'park',
   'V013: one park Spot covers the contiguous park, including Pier 3 and Pier 6; screenshots 188-191'),
  ('public-place-642ca676bfb447e6299896d4', 'City Tech', 'community_space',
   'V014: one campus Spot replaces separate Namm and Voorhees building pins; screenshots 189 and 194; City Tech campus directory confirms common parent'),
  ('osm-node-6534166835', 'Dodge YMCA', 'gym',
   'V018: retained parent of YMCA and The Y at 225 Atlantic Avenue; screenshots 229-231; official YMCA branch directory'),
  ('public-place-686d7a310c1553f46d2aedbc', 'Movement Gowanus', 'gym',
   'V019: the sauna is an internal feature of Movement Gowanus at 242 Butler Street; retain one gym parent; screenshots 234-235 and official Movement gym page'),
  ('public-place-63534bf9ec6732001d164688', 'Washington Park', 'park',
   'V020: Old Stone House is an internal feature of Washington Park/JJ Byrne Playground; one parent park Spot; screenshots 236-237 and official Old Stone House park directory'),
  ('public-place-6980b9b0bc7c55ded7bcf4f9', 'Battery Park City Library', 'library',
   'V012: represent the parent library rather than its bathroom; screenshots 175-180 and NYPL location directory'),
  ('public-place-5c1e790018edf6612e171cc0', 'Millennium Hilton', 'hotel',
   'V012: retained parent hotel rather than bathroom category; screenshots 173-174'),
  ('public-place-638f95638d430f001cc23f62', 'Beekman Hotel', 'hotel',
   'V012: retained parent hotel rather than bathroom category; screenshots 184-185'),
  ('public-place-68934a10969c6d5b1e97b004', 'Tillary Hotel', 'hotel',
   'V014: LL2 gym is an internal hotel feature; screenshot 194 and official Tillary amenities page'),
  ('public-place-676347fd8719f573818a02bf', 'Nitehawk Cinema Prospect Park', 'other',
   'V021: retained parent cinema rather than bathroom category; screenshots 211-212 and 238; official Nitehawk Prospect Park page'),
  ('public-place-6993cf2d2d42d482f3a8c68a', 'Alamo Theatre', 'other',
   'V012: ordinary Alamo cinema rather than adult venue; screenshots 172-174 and official Lower Manhattan theater page'),
  ('public-place-623fb9c92a6cd41c38f51c2f', 'Regal theater', 'other',
   'V012: ordinary Regal Battery Park cinema rather than adult venue; screenshots 175-180 and official Regal theater page'),
  ('public-place-64485a420768f0ec4ec3bc5f', 'Industry City', 'community_space',
   'V022: retain one parent campus rather than its bathroom; screenshots 242-244 and official Industry City campus plan; latest instruction preserves campuses'),
  ('public-place-60734effa5769525b5cdc8f3', 'John J Carty Park', 'park',
   'V023: Shore park 101st bathroom is inside John J Carty Park on Fort Hamilton Parkway at 95th Street; screenshots 264-266 and NYC Community District 10 facilities map'),
  ('public-place-6019a2c593b7ec233c2c3aa9', 'Shore Park and Parkway', 'park',
   'V023: retain one parent waterfront park rather than the Shore road park bathroom; screenshots 255-256 and 262-265 cover the linear waterfront park'),
  ('public-place-682971fbc223bedbca1689b9', 'Dyker Beach Park', 'park',
   'V023: Baseball diamond is an internal feature of Dyker Beach Park; retain one parent park Spot; screenshots 267-268 and NYC Parks boundaries'),
  ('public-place-64e3be40621d478346397e42', 'Coney Island Beach and Boardwalk', 'beach',
   'V024: one parent park covers Coney Island Beach, the boardwalk and Brighton Beach; screenshots 277-283; NYC Parks New Brighton environmental statement confirms common property'),
  ('osm-way-1135288503', 'Coney Island YMCA', 'gym',
   'V024: one parent YMCA gym at 2980 West 29th Street; screenshots 277-278 and official YMCA branch directory'),
  ('public-place-690390eb970a03cbdacdc877', 'Borough of Manhattan Community College', 'community_space',
   'V012: Fiterman Hall and Murray Hall belong to the same downtown BMCC campus; retain one parent campus Spot; screenshots 175-180 and official BMCC campus directory')
)
insert into place_parent_cleanup_20260912 (place_id, original_record, name, facility_type, reason)
select p.id, to_jsonb(p), r.name, r.facility_type, r.reason
from places p join reviewed r using (slug)
where p.status = 'published'
on conflict (place_id) do nothing;

update places p set name = c.name, facility_type = c.facility_type, updated_at = now()
from place_parent_cleanup_20260912 c
where p.id = c.place_id and (p.name <> c.name or p.facility_type <> c.facility_type);
