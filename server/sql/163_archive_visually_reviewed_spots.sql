-- Decisions from the September 12 manual map review, task
-- 01a094d4-5fda-7853-85e5-ca7f5634e4bb. Screenshots remain outside Git.
-- Steamtown: the mall bathroom and mall garage occupy the retail complex
-- south of Lackawanna Avenue. Preserve the separate Crunch gym. The later
-- parking exclusion also archives the Electric City garage through migration
-- 162. Do not infer duplicates from proximity alone.
create table if not exists place_visual_cleanup_20260912 (
  place_id uuid primary key,
  original_record jsonb not null,
  reason text not null,
  recorded_at timestamptz not null default now()
);

insert into place_visual_cleanup_20260912 (place_id, original_record, reason)
select p.id, to_jsonb(p), 'V004: retail mall bathroom or parking within the Steamtown retail complex'
from places p
where p.status = 'published'
  and p.slug in ('public-place-69a9f4d6eed1d274f648a144', 'public-place-695e97df3dbda5f79bd232e1')
on conflict (place_id) do nothing;

-- V012: manually inspected at street/building scale in lower Manhattan.
-- These are retail venues or their bathrooms, not separate public venues.
with reviewed(slug, reason) as (values
  ('public-place-67d5dd69f67e0d15f0df5442', 'V012: Printemps department store at One Wall Street; screenshots 172-173'),
  ('public-place-681ba7900631a2a2dd51965a', 'V012: Century 21 retail bathroom on Cortlandt Street; screenshots 173-174'),
  ('public-place-5bd72114de2900183e687c91', 'V012: Westfield retail bathroom within World Trade Center; screenshots 173-174'),
  ('public-place-67c766e2d9450e9988bd1db9', 'V012: Brookfield Place retail complex; screenshots 175-176'),
  ('public-place-690e7bad367fe1b5e74077e3', 'V012: Hobby Lobby retail bathroom on Warren Street; screenshots 176 and 178'),
  ('public-place-640679f4fb810b001d79fcb3', 'V013: Pier 6 bathroom is an internal feature of Brooklyn Bridge Park; retain one parent park Spot; screenshots 188-191'),
  ('public-place-60bf9a0f8b2b363fc58d9487', 'V013: Greendesk office-space pin on Front Street; office-building sublocation excluded; screenshot 188'),
  ('public-place-610304e36bc315376b2f9dca', 'V013: WeWork office bathroom at Prospect Street; office-building sublocation excluded; screenshots 188-189'),
  ('public-place-641b516f38aa0233cee24cb7', 'V014: City Tech Voorhees is part of the same campus as Namm Hall; retain one City Tech parent Spot; screenshots 189 and 194'),
  ('public-place-682b8d8c9ee5b81eb988576e', 'V001: White Haven Road parking lot within Bear Creek Preserve; later instruction excludes all parking lots'),
  ('public-place-6845b480053fe039da424544', 'V001: South parking lot within Bear Creek Preserve; later instruction excludes all parking lots'),
  ('public-place-645d18e8c392fb0fe2efdf99', 'V010: Willow Brook park-and-ride lot; later parking-lot exclusion supersedes initial transit categorization; screenshots 136-137'),
  ('public-place-6541710d79c6b6492ef1b590', 'V015: Parade Ground is part of Prospect Park; retain one parent Prospect Park Spot; screenshots 204-211 and Prospect Park Alliance Parade Ground concession map'),
  ('public-place-63ec207ec3a14b001d668fa3', 'V016: Park Slope YMCA duplicates Prospect Park YMCA at 357 9th Street; retain osm-way-248237259; screenshots 213-217 and official YMCA branch address'),
  ('public-place-63715dbad5caa9001d913e2f', 'V017: IKEA retail bathroom at the Red Hook store; screenshots 223-224'),
  ('public-place-67336b5bb01a6b657c2b3214', 'V018: The Y duplicates the YMCA parent at 225 Atlantic Avenue; retain osm-node-6534166835; screenshots 229-231 and official Dodge YMCA address'),
  ('public-place-64b3bd6012133f81191c7675', 'V024: Coney Island Boardwalk is part of Coney Island Beach and Boardwalk; retain public-place-64e3be40621d478346397e42 as the single parent; screenshots 277-283'),
  ('public-place-667833193878dca816ed5f4e', 'V024: Brighton Beach belongs to the same Coney Island Beach and Boardwalk park; retain one parent Spot; screenshots 282-283 and NYC Parks New Brighton environmental statement'),
  ('public-place-68422199dcffb3b00774debc', 'V010: Farm Lane trail parking lot inspected at Albany Post Road/FDR Drive in screenshot 154; later instruction excludes every parking lot, superseding the original keep decision'),
  ('public-place-69bb159f0a2211e8ecccc960', 'V012: Murray Hall is part of the same downtown BMCC campus as Fiterman Hall; retain public-place-690390eb970a03cbdacdc877 as one parent campus Spot; screenshots 175-180 and official BMCC campus directory')
)
insert into place_visual_cleanup_20260912 (place_id, original_record, reason)
select p.id, to_jsonb(p), r.reason
from places p join reviewed r using (slug)
where p.status = 'published'
on conflict (place_id) do nothing;

update places p set status = 'archived', updated_at = now()
from place_visual_cleanup_20260912 c
where p.id = c.place_id and p.status = 'published';
