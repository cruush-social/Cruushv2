-- Reviewed same-venue aliases missed by earlier distance and name-direction checks.
-- Preserve the fuller named park and official/open-data survivors, plus a
-- complete before-state. No underlying place/member row is deleted.
-- Identity guards reject changed targets; 1e-7 degree coordinate tolerance only
-- accommodates import precision, not proximity-based duplicate selection.
-- Import replay already uses ON CONFLICT DO NOTHING; repeat application is inert.
-- Recovery requires an explicit owner instruction and a check for later edits
-- before restoring original_record's status. Never replay that recovery blindly.
create table if not exists place_alias_cleanup_20260910 (
  place_id uuid primary key,
  survivor_id uuid not null,
  original_record jsonb not null,
  reason text not null,
  recorded_at timestamptz not null default now()
);

with reviewed (archive_id, archive_slug, archive_name, archive_latitude, archive_longitude, archive_facility, survivor_id, survivor_slug, survivor_name, survivor_latitude, survivor_longitude, survivor_facility, survivor_source, reason) as (
  values
    ('80749d5a-cbda-4ae4-87e6-9ce64706f261'::uuid, 'public-place-5e33f6702a58675d0a47fec5', 'Nowadays  Bar', 40.6929084987::double precision, -73.9016340617::double precision, 'bar', '10000000-0000-4000-8000-000000000014'::uuid, 'nowadays', 'Nowadays', 40.6928669::double precision, -73.9016974::double precision, 'nightclub', 'official', 'Same venue: imported name only appends Bar, 7m separation, and the official venue location agrees with the retained verified record at 56-06 Cooper Avenue. Preserve the official record.'),
    ('087031b3-35d6-55b5-8fb6-ae7afe7d3104'::uuid, 'public-place-68cb146a6e971f3eb36981e3', 'Adult World - Montgomeryville', 40.2355616279::double precision, -75.2391408614::double precision, 'adult_venue', '3d8eb14e-2583-43da-88a1-13e01084cc69'::uuid, 'osm-way-521340899', 'Adult World', 40.2356243::double precision, -75.2390586::double precision, 'adult_shop', 'open_data', 'Same Montgomeryville branch: the operator lists 608 Upper State Road for this branch, matching the retained OSM address; imported pin is 10m away. Other Adult World branches remain distinct.'),
    ('3787c4c6-2781-5f0f-9c1c-9798b8b1c260'::uuid, 'public-place-6934c9c89135428ba4e62d1d', 'Adult World - Quakertown', 40.4218455::double precision, -75.3468958::double precision, 'adult_venue', '322abf19-ffdc-4d4a-9b53-7a731626e72e'::uuid, 'osm-node-7316382302', 'Adult World', 40.4218266::double precision, -75.3467321::double precision, 'adult_shop', 'open_data', 'Same Quakertown branch: the operator lists 880 South West End Boulevard, matching the retained OSM address; imported pin is 14m away. Other Adult World branches remain distinct.'),
    ('16e02537-97cd-4f82-a60c-e17ebb702fc5'::uuid, 'public-place-68be54cea44e0365635a9c6d', 'Partners Cafe', 41.307841757::double precision, -72.9339410476::double precision, 'bar', '23099cf4-a119-4ce1-936d-04b4d42c71b7'::uuid, 'osm-node-2759675066', 'Partners', 41.307965::double precision, -72.9340653::double precision, 'nightclub', 'open_data', 'The operator uses Partners and Partners Cafe for the same bar and nightclub at 365 Crown Street, matching the retained OSM address; pins are 17m apart.'),
    ('d01d20ec-1404-4e00-8a07-cf914c33ce4b'::uuid, 'public-place-60cb6a27f556b774bced5f18', 'YMCA Bedford', 40.6851984195::double precision, -73.9534931125::double precision, 'gym', '1c6ba87b-0b5d-453e-9370-f717bc79e1fd'::uuid, 'osm-way-250003197', 'YMCA', 40.6853432::double precision, -73.9536748::double precision, 'sports_venue', 'open_data', 'Same Bedford-Stuyvesant YMCA branch: the operator lists 1121 Bedford Avenue, matching the retained OSM record; imported Bedford pin is 22m away. Other YMCA branches remain distinct.'),
    ('3c9552a8-2509-435d-b1a5-b459ad0b9282'::uuid, 'public-place-64692608a7b4b1b61850dafc', 'YMCA- westfield', 40.6503829335::double precision, -74.3523942808::double precision, 'sauna', '45b0ca7c-9ac0-4d16-8f16-02c983a3e632'::uuid, 'osm-way-688205870', 'YMCA', 40.650608::double precision, -74.3523781::double precision, 'sports_venue', 'open_data', 'Same Westfield YMCA main facility: named Westfield import is 25m from the retained OSM facility; operator identifies the main facility at 220 Clark Street. Preserve other YMCA branches.'),
    ('fa42eb4b-7a00-5183-b9b4-218279009861'::uuid, 'public-place-63aca9ebd7b7b3001dbf8f1e', 'Romantix Adult Boutique', 41.1977692731::double precision, -73.1926913085::double precision, 'adult_venue', '78110c0c-2693-4d55-94e9-a57d5f3dbc74'::uuid, 'osm-way-207518425', 'Romantix', 41.1980549::double precision, -73.1927192::double precision, 'adult_shop', 'open_data', 'Same Romantix Bridgeport store: operator describes its boutique and arcade at 410 North Avenue, matching retained OSM address; imported pin is 32m away. Adult Boutique is a descriptor rather than another branch.'),
    ('250f0b39-3ed8-4791-8c6d-875a96858d6f'::uuid, 'public-place-5e33f85ac2e2bc29c23221b6', 'Purgatory Bar', 40.6869564368::double precision, -73.9056264372::double precision, 'bar', '11800000-0000-4000-8000-000000000009'::uuid, 'purgatory-brooklyn', 'Purgatory', 40.6872342::double precision, -73.9057388::double precision, 'bar', 'official', 'Same Purgatory bar: NYC City Record names Purgatory at 675 Central Avenue, matching the verified official record; imported Bar extension is 32m away. Preserve official record.'),
    ('962d3602-2e21-4fbd-87f8-331f339d3916'::uuid, 'public-place-615e18fe353dce4ef15a279f', 'YMCA Bethlehem', 40.6212065004::double precision, -75.3676981706::double precision, 'gym', 'e97e1347-ca37-4b5b-8cb5-edfb4f1436da'::uuid, 'osm-node-6338071905', 'YMCA', 40.6216475::double precision, -75.3680086::double precision, 'sports_venue', 'open_data', 'Same Bethlehem YMCA branch: operator lists 430 East Broad Street, matching the retained OSM record; imported Bethlehem pin is 56m away. Other YMCA branches remain distinct.'),
    ('137f4247-d81b-5dba-8dc8-df7d9a551dd8'::uuid, 'public-place-6a85dd8cc8a8fef9c0016893', 'Citi Field Mets', 40.756599007::double precision, -73.8453102358::double precision, 'other', 'a4eca2a4-076e-4a1d-940f-df6d91fb3704'::uuid, 'osm-way-604023701', 'Citi Field', 40.7570372::double precision, -73.8458585::double precision, 'sports_venue', 'open_data', 'Mets venue name and address match retained stadium; imported Mets suffix pin is 67m away.'),
    ('4d7674b5-fb45-5c58-aa0d-eab754f8d30d'::uuid, 'public-place-6652e6fe093a42e1b6ce95fa', 'Lincoln Terrace', 40.6652306711::double precision, -73.9285648249::double precision, 'park', 'b7d34990-a819-5159-a24e-64197ff8c7b7'::uuid, 'public-place-5e24203ff014e47837f15c65', 'Lincoln Terrace aka Arthur Somers Park', 40.6668973948::double precision, -73.924515356::double precision, 'park', 'community', 'Same Lincoln Terrace / Arthur S. Somers Park, 389m apart. Preserve the fuller existing title and location.')
), backed_up as (
  insert into place_alias_cleanup_20260910 (place_id, survivor_id, original_record, reason)
  select p.id, kept.id, to_jsonb(p), r.reason
  from reviewed r
  join places p on p.id = r.archive_id and p.slug = r.archive_slug and p.name = r.archive_name
    and abs(p.latitude - r.archive_latitude) < 0.0000001 and abs(p.longitude - r.archive_longitude) < 0.0000001
  join places kept on kept.id = r.survivor_id and kept.slug = r.survivor_slug and kept.name = r.survivor_name
    and abs(kept.latitude - r.survivor_latitude) < 0.0000001 and abs(kept.longitude - r.survivor_longitude) < 0.0000001
  where p.status = 'published' and kept.status = 'published'
    and p.source_kind = 'community' and p.slug ~ '^public-place-[a-f0-9]{24}$'
    and kept.source_kind = r.survivor_source
    and p.facility_type = r.archive_facility and kept.facility_type = r.survivor_facility
  on conflict (place_id) do nothing
  returning place_id
)
update places p set status = 'archived', updated_at = now()
from backed_up saved
where p.id = saved.place_id and p.status = 'published';
