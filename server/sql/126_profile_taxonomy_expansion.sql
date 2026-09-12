create or replace function pg_temp.cruush_profile_vibes_v16_expanded(input_values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(value order by first_position), '{}'::text[])
  from (
    select value, min(position) as first_position
    from (
      select
        case lower(trim(item))
          when 'sporty' then 'Jock'
          when 'jock' then 'Jock'
          when 'hacker' then 'Techie'
          when 'techie' then 'Techie'
          when 'rave' then 'Raver'
          when 'raver' then 'Raver'
          when 'goddess' then 'God/Goddess'
          when 'god/goddess' then 'God/Goddess'
          else item
        end as value,
        position
      from unnest(coalesce(input_values, '{}'::text[])) with ordinality as values_with_position(item, position)
      where lower(trim(item)) not in (
        'brat', 'brat tamer', 'caregiver', 'degradee', 'degrader', 'dominant', 'handler', 'little',
        'masochist', 'owned', 'owner', 'pet', 'prey', 'primal', 'rigger', 'rope bunny', 'sadist',
        'sadomasochist', 'service', 'submissive', 'switch', 'trainer', 'worship', 'worshipped', 'worshipper'
      )
    ) normalized_values
    where trim(value) <> ''
    group by value
  ) unique_values;
$$;

create or replace function pg_temp.cruush_profile_roles_v16_expanded(
  existing_roles text[],
  vibes text[],
  scenes text[],
  archetypes text[]
)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(value order by value), '{}'::text[])
  from (
    select distinct
      case lower(trim(item))
        when 'worship' then 'worshipper'
        else lower(trim(item))
      end as value
    from unnest(
      coalesce(existing_roles, '{}'::text[]) ||
      coalesce(vibes, '{}'::text[]) ||
      coalesce(scenes, '{}'::text[]) ||
      coalesce(archetypes, '{}'::text[])
    ) as role_values(item)
    where trim(item) <> ''
      and (
        item = any(coalesce(existing_roles, '{}'::text[]))
        or lower(trim(item)) in (
          'brat', 'brat tamer', 'caregiver', 'degradee', 'degrader', 'dominant', 'handler', 'little',
          'masochist', 'owned', 'owner', 'pet', 'prey', 'primal', 'rigger', 'rope bunny', 'sadist',
          'sadomasochist', 'service', 'submissive', 'switch', 'trainer', 'worship', 'worshipped', 'worshipper'
        )
      )
  ) unique_roles;
$$;

update profiles
set
  role = pg_temp.cruush_profile_roles_v16_expanded(role, vibes, scenes, archetypes),
  vibes = pg_temp.cruush_profile_vibes_v16_expanded(vibes),
  scenes = pg_temp.cruush_profile_vibes_v16_expanded(scenes),
  archetypes = pg_temp.cruush_profile_vibes_v16_expanded(archetypes)
where
  exists (
    select 1
    from unnest(
      coalesce(role, '{}'::text[]) ||
      coalesce(vibes, '{}'::text[]) ||
      coalesce(scenes, '{}'::text[]) ||
      coalesce(archetypes, '{}'::text[])
    ) as profile_values(value)
    where lower(trim(value)) in (
      'sporty', 'jock', 'hacker', 'techie', 'rave', 'raver', 'goddess', 'god/goddess',
      'brat', 'brat tamer', 'caregiver', 'degradee', 'degrader', 'dominant', 'handler', 'little',
      'masochist', 'owned', 'owner', 'pet', 'prey', 'primal', 'rigger', 'rope bunny', 'sadist',
      'sadomasochist', 'service', 'submissive', 'switch', 'trainer', 'worship', 'worshipped', 'worshipper'
    )
  );
