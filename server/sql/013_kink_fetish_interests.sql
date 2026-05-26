create table if not exists kink_catalog (
  id text primary key,
  label text not null,
  category text not null,
  aliases text[] not null default '{}',
  safety_level text not null default 'standard' check (safety_level in ('standard', 'discuss', 'edge')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profile_kink_interests (
  user_id uuid not null references app_users(id) on delete cascade,
  kink_id text not null references kink_catalog(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kink_id)
);

insert into kink_catalog (id, label, category, aliases, safety_level, sort_order)
values
  ('anal', 'anal', 'Body & Touch', '{}', 'standard', 10),
  ('massage', 'massage', 'Body & Touch', '{}', 'standard', 20),
  ('mutual-masturbation', 'mutual masturbation', 'Body & Touch', '{}', 'standard', 30),
  ('nipple-play', 'nipple play', 'Body & Touch', '{}', 'standard', 40),
  ('oral', 'oral', 'Body & Touch', '{}', 'standard', 50),
  ('pegging', 'pegging', 'Body & Touch', '{}', 'standard', 60),
  ('pits', 'pits', 'Body & Touch', '{}', 'standard', 70),
  ('rimming', 'rimming', 'Body & Touch', '{}', 'standard', 80),
  ('bondage', 'bondage', 'Power', '{}', 'standard', 110),
  ('chastity', 'chastity', 'Power', '{}', 'standard', 120),
  ('edging', 'edging', 'Power', '{}', 'standard', 130),
  ('humiliation', 'humiliation', 'Power', '{}', 'discuss', 140),
  ('impact', 'impact', 'Power', '{}', 'discuss', 150),
  ('praise', 'praise', 'Power', '{}', 'standard', 160),
  ('rough', 'rough', 'Power', '{}', 'edge', 170),
  ('spanking', 'spanking', 'Power', '{}', 'standard', 180),
  ('costumes', 'costumes', 'Gear', '{}', 'standard', 210),
  ('leather', 'leather', 'Gear', '{}', 'standard', 220),
  ('lingerie', 'lingerie', 'Gear', '{}', 'standard', 230),
  ('uniforms', 'uniforms', 'Gear', '{}', 'standard', 240),
  ('dirty-talk', 'dirty talk', 'Roleplay', '{}', 'standard', 310),
  ('pet-play', 'pet play', 'Roleplay', '{}', 'standard', 320),
  ('roleplay', 'roleplay', 'Roleplay', '{}', 'standard', 330),
  ('group', 'group', 'Group', '{}', 'standard', 410),
  ('exhibitionism', 'exhibitionism', 'Voyeur / Exhibition', '{}', 'standard', 510),
  ('public', 'public', 'Voyeur / Exhibition', '{}', 'discuss', 520),
  ('voyeurism', 'voyeurism', 'Voyeur / Exhibition', '{}', 'standard', 530),
  ('sensation', 'sensation', 'Sensory', '{}', 'standard', 610),
  ('wax', 'wax', 'Sensory', '{}', 'discuss', 620),
  ('toys', 'toys', 'Toys', '{}', 'standard', 710),
  ('breath-play', 'breath play', 'Edge / Discuss', '{}', 'edge', 810),
  ('cbt', 'cbt', 'Edge / Discuss', '{}', 'edge', 820),
  ('feet', 'feet', 'Other / Discuss', '{}', 'standard', 910),
  ('fisting', 'fisting', 'Other / Discuss', '{}', 'edge', 920),
  ('gooning', 'gooning', 'Other / Discuss', '{}', 'standard', 930),
  ('watersports', 'watersports', 'Other / Discuss', '{}', 'discuss', 940)
on conflict (id) do update
set label = excluded.label,
    category = excluded.category,
    aliases = excluded.aliases,
    safety_level = excluded.safety_level,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();

create index if not exists profile_kink_interests_kink_id_idx
  on profile_kink_interests (kink_id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'profiles'
      and column_name = 'kinks'
  ) then
    execute $migrate_legacy_kinks$
      insert into profile_kink_interests (
        user_id,
        kink_id
      )
      select distinct
        profiles.id,
        legacy_kinks.kink_id
      from profiles
      cross join lateral (
        select regexp_replace(lower(trim(kink)), '[^a-z0-9]+', '-', 'g') as kink_id
        from unnest(profiles.kinks) as kink
      ) legacy_kinks
      join kink_catalog on kink_catalog.id = legacy_kinks.kink_id
      where legacy_kinks.kink_id <> ''
      on conflict (user_id, kink_id) do nothing
    $migrate_legacy_kinks$;
  end if;
end $$;
