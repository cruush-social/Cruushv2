create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 1000),
  directory_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists club_tags (
  club_id uuid not null references clubs(id) on delete cascade,
  tag text not null check (
    char_length(tag) between 1 and 64
    and tag = lower(btrim(tag))
    and position(',' in tag) = 0
  ),
  primary key (club_id, tag)
);

create index if not exists idx_club_tags_tag on club_tags(tag, club_id);
create index if not exists idx_clubs_directory_visible_title
  on clubs(title, id)
  where directory_visible = true;
