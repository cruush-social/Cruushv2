create or replace function pg_temp.cruush_profile_vibes_v16(input_values text[])
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
          when 'techie' then 'Techie'
          when 'hacker' then 'Techie'
          when 'rave' then 'Raver'
          when 'raver' then 'Raver'
          else item
        end as value,
        position
      from unnest(coalesce(input_values, '{}'::text[])) with ordinality as values_with_position(item, position)
      where lower(trim(item)) not in ('brat', 'handler', 'rigger', 'rope bunny', 'service', 'trainer')
    ) normalized_values
    where trim(value) <> ''
    group by value
  ) unique_values;
$$;

create or replace function pg_temp.cruush_profile_roles_v16(
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
        when 'rope bunny' then 'rope bunny'
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
        or lower(trim(item)) in ('brat', 'handler', 'rigger', 'rope bunny', 'service', 'trainer')
      )
  ) unique_roles;
$$;

create or replace function pg_temp.cruush_profile_kinks_v16(input_values text[])
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
          when 'bimbo' then 'bimbofication'
          else item
        end as value,
        position
      from unnest(coalesce(input_values, '{}'::text[])) with ordinality as values_with_position(item, position)
    ) normalized_values
    where trim(value) <> ''
    group by value
  ) unique_values;
$$;

update profiles
set
  role = pg_temp.cruush_profile_roles_v16(role, vibes, scenes, archetypes),
  vibes = pg_temp.cruush_profile_vibes_v16(vibes),
  scenes = pg_temp.cruush_profile_vibes_v16(scenes),
  archetypes = pg_temp.cruush_profile_vibes_v16(archetypes),
  kinks = pg_temp.cruush_profile_kinks_v16(kinks)
where
  exists (
    select 1
    from unnest(
      coalesce(vibes, '{}'::text[]) ||
      coalesce(scenes, '{}'::text[]) ||
      coalesce(archetypes, '{}'::text[]) ||
      coalesce(kinks, '{}'::text[])
    ) as profile_values(value)
    where lower(trim(value)) in (
      'sporty', 'jock', 'techie', 'hacker', 'rave', 'raver', 'bimbo',
      'brat', 'handler', 'rigger', 'rope bunny', 'service', 'trainer'
    )
  );
