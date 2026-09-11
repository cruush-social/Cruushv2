-- The OpenStreetMap import brought in every school field, YMCA, municipal pool
-- and dance studio tagged as a sports venue. Only the landmark venues are worth
-- a pin: places somebody would name when arranging to meet. Everything else is
-- archived rather than deleted, and the statement is idempotent so migration
-- replay stays safe.
update places
set status = 'archived',
    updated_at = now()
where facility_type = 'sports_venue'
  and source_kind = 'open_data'
  and slug ~ '^osm-(node|way|relation)-[0-9]+$'
  and status = 'published'
  and name not in (
    'Aqueduct Racetrack',
    'Arthur Ashe Stadium',
    'Barclays Center',
    'Belmont Park',
    'Citi Field',
    'Citizens Bank Park',
    'Forest Hills Stadium',
    'Hinchliffe Stadium',
    'Icahn Stadium',
    'Lincoln Financial Field',
    'Madison Square Garden',
    'Maimonides Park',
    'MetLife Stadium',
    'Nassau Veterans Memorial Coliseum',
    'Prudential Center',
    'SHI Stadium',
    'Sports Illustrated Stadium',
    'UBS Arena',
    'USTA Billie Jean King National Tennis Center',
    'Yale Bowl',
    'Yankee Stadium'
  );
