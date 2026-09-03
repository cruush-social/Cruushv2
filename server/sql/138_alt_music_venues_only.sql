-- The OpenStreetMap music venues are Broadway houses, regional playhouses,
-- performing-arts centres and comedy clubs. None of them belong on this map.
-- What stays is the rooms that book the alt, goth, DIY, queer, punk, metal,
-- EDM, pop and disco bills. Migration 139 moves more of those rooms in from
-- bar and nightclub, so every name it promotes is listed here too: this file
-- runs first on each replay and would otherwise archive them straight back.
-- Archived rather than deleted, and idempotent so migration replay stays safe.
update places
set status = 'archived',
    updated_at = now()
where facility_type = 'music_venue'
  and status = 'published'
  and name not in (
    'Baby''s All Right',
    'Bowery Ballroom',
    'Brooklyn Made',
    'Brooklyn Steel',
    'Elsewhere',
    'Irving Plaza',
    'Knockdown Center',
    'Le Poisson Rouge',
    'Littlefield',
    'Mercury Lounge',
    'Music Hall of Williamsburg',
    'The Stone Pony',
    'The Stone Pony Summer Stage',
    'The Sultan Room',
    'Trans-Pecos',
    'Warsaw Concerts',
    'Webster Hall'
  );
