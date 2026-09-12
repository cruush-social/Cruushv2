-- Rooms that book live bills belong under Music venue, not Bar or Nightclub.
-- The Stone Pony, Trans-Pecos and Saint Vitus are the shape of it: you go for
-- who is playing. The dance floors stay nightclubs, because you go for the
-- night rather than the bill: Bossa Nova Civic Club, Nowadays, Good Room,
-- Jupiter Disco, Public Records, Paragon, House of Yes, 3 Dollar Bill.
--
-- Written against the source categories rather than the destination so a replay
-- still matches, and every name here also appears in migration 138's keep list,
-- which runs first and would otherwise archive these rows again.
update places
set facility_type = 'music_venue',
    updated_at = now()
where facility_type in ('bar', 'nightclub')
  and name in (
    'Baby''s All Right',
    'Bowery Ballroom',
    'Brooklyn Steel',
    'Elsewhere',
    'Knockdown Center',
    'Mercury Lounge',
    'The Stone Pony',
    'The Sultan Room',
    'Warsaw Concerts',
    'Webster Hall'
  );

-- Migration 138 swept these two in with the Broadway houses.
update places
set status = 'published',
    updated_at = now()
where facility_type = 'music_venue'
  and status = 'archived'
  and name in (
    'Brooklyn Made',
    'The Stone Pony Summer Stage'
  );
