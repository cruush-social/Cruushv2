create or replace function pg_temp.cruush_profile_positions_v16(input_values text[])
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
          when 'pillow princess' then 'stone bottom'
          else lower(trim(item))
        end as value,
        position
      from unnest(coalesce(input_values, '{}'::text[])) with ordinality as values_with_position(item, position)
      where trim(item) <> ''
    ) normalized_values
    group by value
  ) unique_values;
$$;

update profiles
set position = pg_temp.cruush_profile_positions_v16(position)
where exists (
  select 1
  from unnest(coalesce(position, '{}'::text[])) as profile_positions(value)
  where lower(trim(value)) = 'pillow princess'
);

update profiles
set
  scenes = array(
    select value
    from unnest(coalesce(scenes, '{}'::text[])) with ordinality as scene_values(value, position)
    where lower(trim(value)) <> 'gaming'
    order by position
  ),
  hobbies = case
    when exists (
      select 1 from unnest(coalesce(hobbies, '{}'::text[])) as hobby_values(value)
      where lower(trim(value)) in ('gaming', 'video games')
    ) then hobbies
    else array_append(coalesce(hobbies, '{}'::text[]), 'Video games')
  end
where exists (
  select 1 from unnest(coalesce(scenes, '{}'::text[])) as scene_values(value)
  where lower(trim(value)) = 'gaming'
);

update profiles
set scenes = array(
  select distinct_value
  from (
    select
      case lower(trim(value))
        when 'warehouse' then 'Underground'
        else value
      end as distinct_value,
      min(position) as first_position
    from unnest(coalesce(scenes, '{}'::text[])) with ordinality as scene_values(value, position)
    where trim(value) <> ''
    group by case lower(trim(value))
      when 'warehouse' then 'Underground'
      else value
    end
  ) normalized_scenes
  order by first_position
)
where exists (
  select 1
  from unnest(coalesce(scenes, '{}'::text[])) as scene_values(value)
  where lower(trim(value)) = 'warehouse'
);

update profiles
set
  presentation = array(
    select value
    from unnest(coalesce(presentation, '{}'::text[])) with ordinality as presentation_values(value, position)
    where lower(trim(value)) <> 'sissy'
    order by position
  ),
  archetypes = case
    when exists (
      select 1 from unnest(coalesce(archetypes, '{}'::text[])) as archetype_values(value)
      where lower(trim(value)) = 'sissy'
    ) then archetypes
    else array_append(coalesce(archetypes, '{}'::text[]), 'Sissy')
  end
where exists (
  select 1 from unnest(coalesce(presentation, '{}'::text[])) as presentation_values(value)
  where lower(trim(value)) = 'sissy'
);

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
          when 'diaper' then 'diapers'
          else lower(trim(item))
        end as value,
        position
      from unnest(coalesce(input_values, '{}'::text[])) with ordinality as values_with_position(item, position)
      where trim(item) <> ''
        and lower(trim(item)) not in ('brat taming', 'dominance', 'service', 'submission')
    ) normalized_values
    group by value
  ) unique_values;
$$;

create or replace function pg_temp.cruush_profile_roles_v16(input_roles text[], input_kinks text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(value order by first_position), '{}'::text[])
  from (
    select value, min(position) as first_position
    from (
      select lower(trim(item)) as value, position
      from unnest(coalesce(input_roles, '{}'::text[])) with ordinality as role_values(item, position)
      where trim(item) <> ''
      union all
      select
        case lower(trim(item))
          when 'brat taming' then 'brat tamer'
          when 'dominance' then 'dominant'
          when 'submission' then 'submissive'
          else lower(trim(item))
        end as value,
        cardinality(coalesce(input_roles, '{}'::text[])) + position
      from unnest(coalesce(input_kinks, '{}'::text[])) with ordinality as kink_values(item, position)
      where lower(trim(item)) in ('brat taming', 'dominance', 'service', 'submission')
    ) normalized_values
    group by value
  ) unique_values;
$$;

update profiles
set
  roles = pg_temp.cruush_profile_roles_v16(roles, kinks),
  kinks = pg_temp.cruush_profile_kinks_v16(kinks)
where exists (
  select 1
  from unnest(coalesce(kinks, '{}'::text[])) as kink_values(value)
  where lower(trim(value)) in ('diaper', 'brat taming', 'dominance', 'service', 'submission')
);

update profiles
set vibes = array(
  select value
  from (
    select
      case lower(trim(item))
        when 'adhd' then 'Neurodivergent'
        when 'autistic' then 'Neurodivergent'
        else item
      end as value,
      min(position) as first_position
    from unnest(coalesce(vibes, '{}'::text[])) with ordinality as vibe_values(item, position)
    where trim(item) <> ''
    group by case lower(trim(item))
      when 'adhd' then 'Neurodivergent'
      when 'autistic' then 'Neurodivergent'
      else item
    end
  ) normalized_vibes
  order by first_position
)
where exists (
  select 1
  from unnest(coalesce(vibes, '{}'::text[])) as vibe_values(value)
  where lower(trim(value)) in ('adhd', 'autistic')
);
