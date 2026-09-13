-- Rail/subway stations share one category; bus stops remain separate.
alter table places drop constraint if exists places_facility_type_check;
alter table places add constraint places_facility_type_check check (facility_type in (
  'clinic', 'bar', 'nightclub', 'community_space', 'park', 'restroom',
  'sauna', 'gym', 'hotel', 'dungeon', 'cafe', 'shop', 'library',
  'staircase', 'trail', 'transit', 'rail_station', 'bus_stop', 'parking',
  'beach', 'adult_venue', 'adult_shop', 'music_venue', 'sports_venue',
  'retail', 'woods', 'rest_stop', 'bridge', 'other'
));

create table if not exists place_transit_cleanup_20260912 (
  place_id uuid primary key,
  original_record jsonb not null,
  facility_type text not null check (facility_type in ('transit', 'rail_station', 'bus_stop')),
  reason text not null,
  recorded_at timestamptz not null default now()
);

with reviewed(slug, facility_type, reason) as (values
  ('public-place-63caf84defaf94001d1a12b3', 'rail_station', 'V009: Rhinecliff-Kingston station, Dutchess Terrace and Hutton Street; one station Spot'),
  ('public-place-645d18e8c392fb0fe2efdf99', 'transit', 'V010: Willow Brook Road park-and-ride at Bulls Head Road; mapped location confirmed by Dutchess County Public Transit park-and-ride directory'),
  ('public-place-63c1c728bb1a25001dec9d1f', 'rail_station', 'V012: World Trade Center rail station; screenshots 174-175'),
  ('public-place-623533d255417c59019caaaf', 'rail_station', 'V012: Park Place 2/3 subway station; screenshots 175 and 184'),
  ('public-place-6614df9abf02a2dfb7370cb2', 'rail_station', 'V012: Chambers Street subway station at West Broadway; screenshots 176 and 184'),
  ('public-place-67cd264ef849baf89d4dbc19', 'rail_station', 'V013: High Street A/C subway station at Cadman Plaza; screenshots 188-189')
)
insert into place_transit_cleanup_20260912 (place_id, original_record, facility_type, reason)
select p.id, to_jsonb(p), r.facility_type, r.reason
from places p join reviewed r using (slug)
where p.status = 'published'
on conflict (place_id) do nothing;

-- T001: category corrections from operator station directories. These do not
-- assert that the records have completed the separate manual duplicate review.
-- Bus terminals remain Transit; individual bus stops use Bus stops.
with categorized(slug, facility_type, reason) as (values
  ('public-place-63cb02d7efaf94001d1ef957', 'rail_station', 'T001: Ardmore; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63cafcb2efaf94001d1c0edc', 'rail_station', 'T001: Croton-Harmon; MTA Metro-North station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1c2cbbb1a25001dea8f26', 'rail_station', 'T001: Grand Central Terminal; MTA Metro-North station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1c649bb1a25001dec3c20', 'rail_station', 'T001: Harlem-125th Street; MTA Metro-North station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1d3bcbb1a25001df23ca4', 'rail_station', 'T001: Hoboken Terminal; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1d159bb1a25001df130db', 'rail_station', 'T001: Jamaica Station; MTA LIRR station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63caffebefaf94001d1da0b1', 'rail_station', 'T001: Metropark; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1c561bb1a25001debd0d8', 'rail_station', 'T001: New Haven Union Station; MTA New Haven Line timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1d261bb1a25001df1a721', 'rail_station', 'T001: Newark Penn Station; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-63cb09b0efaf94001d2230a0', 'rail_station', 'T001: Paoli; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1cb05bb1a25001dee645c', 'rail_station', 'T001: Philadelphia 30th Street Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63caf8afefaf94001d1a3fe0', 'rail_station', 'T001: Poughkeepsie; MTA Metro-North station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63cb013fefaf94001d1e3a0f', 'rail_station', 'T001: Princeton; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-63c1d447bb1a25001df273d2', 'rail_station', 'T001: Secaucus Junction; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-694b8ed3d55e9fd0b55db4cb', 'rail_station', 'T001: 14th Street PATH; Port Authority PATH station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-699e016fd9f5c5332336ec03', 'rail_station', 'T001: 71st Continental Station; MTA subway map, Forest Hills-71 Avenue; category correction only, geographic duplicate review remains separate'),
  ('public-place-69a61eb4d6b59a8b955ca6c0', 'rail_station', 'T001: Bellmore Train Station; MTA LIRR station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-6a1495d1431f36d87d93d2f0', 'rail_station', 'T001: Bowery Station; MTA subway map; category correction only, geographic duplicate review remains separate'),
  ('public-place-61796fdae0c444515c1ed2f6', 'rail_station', 'T001: Bryn Mawr Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-683a223a50a3758d7135aaa5', 'rail_station', 'T001: Centre Avenue train station; MTA Long Beach Branch timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-67d02a94b4266de972586335', 'rail_station', 'T001: Cornwells Heights Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-667348d09ace4c62b17f118d', 'rail_station', 'T001: Cranford station; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-64816e13d0f77e8408df51a6', 'rail_station', 'T001: D Train Station Fordham; MTA subway map; category correction only, geographic duplicate review remains separate'),
  ('public-place-65e5441dbc1eb5f63ecd2e3c', 'rail_station', 'T001: Dyckman 1 Train Station; MTA subway map; category correction only, geographic duplicate review remains separate'),
  ('public-place-6a36ad38c38bb25d1359bacf', 'rail_station', 'T001: Eastwick Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-689ca8497c272b94c166d71a', 'rail_station', 'T001: Eddington station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-6802cae352eb90ce3c9fa285', 'rail_station', 'T001: Elizabeth Station; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-68eb3ec150abcbdfdc2c4ae7', 'rail_station', 'T001: Fordham Metro-North Station; MTA New Haven Line timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-5fd6711dcddb5d2621bb5861', 'rail_station', 'T001: Greenwich Train station; MTA New Haven Line timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-67f2e80985f77e3c266026d5', 'rail_station', 'T001: Huntington train station; MTA LIRR station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-69ccff1b454782d1b090268c', 'rail_station', 'T001: Jackson Heights-Roosevelt Station; MTA subway map; category correction only, geographic duplicate review remains separate'),
  ('public-place-6313c7eaf3729a034a7f7ace', 'rail_station', 'T001: Journal Square PATH Station; Port Authority PATH station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-699e08626faf748235286594', 'rail_station', 'T001: Kew Gardens-Union Turnpike Station; MTA subway map; category correction only, geographic duplicate review remains separate'),
  ('public-place-6932b5509bd907401bb094c7', 'rail_station', 'T001: Levittown Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-65c045d2b367f7896642ed6e', 'rail_station', 'T001: Long Beach LIRR Station; MTA Long Beach Branch timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-683a2820536d8139614bd7ef', 'rail_station', 'T001: Lynbrook train station; MTA Long Beach Branch timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-69d12a59045d483dcf000016', 'rail_station', 'T001: Mets-Willets Point Train Station; MTA subway map; category correction only, geographic duplicate review remains separate'),
  ('public-place-65d957900cf5a8eb7516abb6', 'rail_station', 'T001: Nassau Boulevard train station; MTA LIRR station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-63939d9fb14281001def1b71', 'transit', 'T001: Port Authority Bus Terminal; Port Authority bus terminal directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-669eb89608adb0315e1b820e', 'rail_station', 'T001: Port Jefferson Train Station; MTA LIRR station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-68ac9dd1df841c75da204ce2', 'rail_station', 'T001: Rutherford Station; NJ Transit Main-Bergen County Line timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-67943a6e0e1d46bc0e479683', 'rail_station', 'T001: Mastic-Shirley train station; MTA Montauk Branch timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-692a76008ca1c147e2d31676', 'rail_station', 'T001: Somerton Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-6913483f11f883e45fbf7000', 'rail_station', 'T001: Speonk Train Station; MTA Montauk Branch timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-62c4dbe393a0d0001d0ea4eb', 'rail_station', 'T001: Torresdale Train Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate'),
  ('public-place-6a683e09eef241f12b7a82d4', 'rail_station', 'T001: Waldwick Train Station; NJ Transit rail system map; category correction only, geographic duplicate review remains separate'),
  ('public-place-67f09b7b869a40b8b3b0f26d', 'rail_station', 'T001: West Haven train station; MTA New Haven Line timetable; category correction only, geographic duplicate review remains separate'),
  ('public-place-628e6de137f19a7029f96e04', 'bus_stop', 'T001: West Milford bus stop; existing explicitly identified bus-stop record; category correction only, geographic duplicate review remains separate'),
  ('public-place-69bb05b316c234cab09f0dde', 'rail_station', 'T001: Woodbourne Station; SEPTA regional rail station directory; category correction only, geographic duplicate review remains separate')
)
insert into place_transit_cleanup_20260912 (place_id, original_record, facility_type, reason)
select p.id, to_jsonb(p), c.facility_type, c.reason
from places p join categorized c using (slug)
where p.status = 'published'
on conflict (place_id) do nothing;

update places p set facility_type = c.facility_type, updated_at = now()
from place_transit_cleanup_20260912 c
where p.id = c.place_id and p.facility_type <> c.facility_type;
