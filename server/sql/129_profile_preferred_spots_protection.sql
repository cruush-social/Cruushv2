alter table profiles
  add column if not exists preferred_spots text[] not null default '{}',
  add column if not exists protection_boundaries text[] not null default '{}';

with normalized_profiles as (
  select
    id,
    array(
      select mapped_value
      from (
        select
          case lower(trim(value))
            when 'bathroom' then 'Bathroom'
            when 'car' then 'Car'
            when 'hotel' then 'Hotel'
            when 'locker room' then 'Locker room'
            when 'outdoors' then 'Outdoors'
            when 'sauna' then 'Sauna'
          end as mapped_value,
          min(position) as first_position
        from unnest(coalesce(hosting_travel, '{}'::text[])) with ordinality as hosting_values(value, position)
        where lower(trim(value)) in ('bathroom', 'car', 'hotel', 'locker room', 'outdoors', 'sauna')
        group by case lower(trim(value))
          when 'bathroom' then 'Bathroom'
          when 'car' then 'Car'
          when 'hotel' then 'Hotel'
          when 'locker room' then 'Locker room'
          when 'outdoors' then 'Outdoors'
          when 'sauna' then 'Sauna'
        end
      ) mapped_spots
      order by first_position
      limit 3
    ) as migrated_spots,
    array(
      select value
      from unnest(coalesce(hosting_travel, '{}'::text[])) with ordinality as hosting_values(value, position)
      where lower(trim(value)) in ('ask me', 'can host', 'can travel', 'can''t host', 'can''t travel')
      order by position
    ) as hosting_values
  from profiles
)
update profiles
set
  preferred_spots = case
    when cardinality(preferred_spots) = 0 then normalized_profiles.migrated_spots
    else preferred_spots
  end,
  hosting_travel = normalized_profiles.hosting_values
from normalized_profiles
where profiles.id = normalized_profiles.id
  and (
    hosting_travel is distinct from normalized_profiles.hosting_values
    or (
      cardinality(preferred_spots) = 0
      and cardinality(normalized_profiles.migrated_spots) > 0
    )
  );

update profiles
set hobbies = array(
  select hobby
  from (
    select
      case lower(trim(value))
        when 'gaming' then 'video games'
        else value
      end as hobby,
      min(position) as first_position
    from unnest(coalesce(hobbies, '{}'::text[])) with ordinality as hobby_values(value, position)
    where trim(value) <> ''
    group by case lower(trim(value))
      when 'gaming' then 'video games'
      else value
    end
  ) normalized_hobbies
  order by first_position
)
where exists (
  select 1
  from unnest(coalesce(hobbies, '{}'::text[])) as hobby_values(value)
  where lower(trim(value)) = 'gaming'
);

update profiles
set kinks = array(
  select value
  from unnest(coalesce(kinks, '{}'::text[])) with ordinality as kink_values(value, position)
  where lower(trim(value)) not in ('being collared', 'collaring', 'spanking implements')
  order by position
)
where exists (
  select 1
  from unnest(coalesce(kinks, '{}'::text[])) as kink_values(value)
  where lower(trim(value)) in ('being collared', 'collaring', 'spanking implements')
);

update profiles
set role = array(
  select role
  from (
    select
      case lower(trim(value))
        when 'primal' then 'hunter'
        else value
      end as role,
      min(position) as first_position
    from unnest(coalesce(role, '{}'::text[])) with ordinality as role_values(value, position)
    where trim(value) <> ''
    group by case lower(trim(value))
      when 'primal' then 'hunter'
      else value
    end
  ) normalized_roles
  order by first_position
)
where exists (
  select 1
  from unnest(coalesce(role, '{}'::text[])) as role_values(value)
  where lower(trim(value)) = 'primal'
);

with owned_profiles as (
  select
    id,
    array(
      select value
      from unnest(coalesce(role, '{}'::text[])) with ordinality as role_values(value, position)
      where lower(trim(value)) <> 'owned'
      order by position
    ) as role_without_owned,
    case
      when exists (
        select 1
        from unnest(coalesce(archetypes, '{}'::text[])) as archetype_values(value)
        where lower(trim(value)) = 'owned'
      ) then archetypes
      else array_append(coalesce(archetypes, '{}'::text[]), 'Owned')
    end as archetypes_with_owned
  from profiles
  where exists (
    select 1
    from unnest(coalesce(role, '{}'::text[])) as role_values(value)
    where lower(trim(value)) = 'owned'
  )
)
update profiles
set
  role = owned_profiles.role_without_owned,
  archetypes = owned_profiles.archetypes_with_owned
from owned_profiles
where profiles.id = owned_profiles.id;
