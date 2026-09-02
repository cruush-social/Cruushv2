-- One retained Spot vibe report set per member and Spot.
create table if not exists place_vibe_reports (
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  vibe text not null check (vibe in (
    'chill', 'social', 'flirty', 'cruisy', 'dancey', 'high_energy',
    'intimate', 'community', 'after_hours', 'outdoor', 'historical', 'exposed'
  )),
  reported_at timestamptz not null default now(),
  primary key (place_id, user_id, vibe)
);

create index if not exists idx_place_vibe_reports_aggregate
  on place_vibe_reports (place_id, vibe, reported_at desc);
