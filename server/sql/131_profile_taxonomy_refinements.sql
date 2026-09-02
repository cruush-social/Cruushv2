update profiles
set kinks = array(
  select kink
  from (
    select
      case lower(trim(value))
        when 'feederism' then 'food play'
        else value
      end as kink,
      min(position) as first_position
    from unnest(coalesce(kinks, '{}'::text[])) with ordinality as kink_values(value, position)
    where trim(value) <> ''
    group by case lower(trim(value))
      when 'feederism' then 'food play'
      else value
    end
  ) normalized_kinks
  order by first_position
)
where exists (
  select 1
  from unnest(coalesce(kinks, '{}'::text[])) as kink_values(value)
  where lower(trim(value)) = 'feederism'
);

with feral_profiles as (
  select
    id,
    array(
      select value
      from unnest(coalesce(vibes, '{}'::text[])) with ordinality as vibe_values(value, position)
      where lower(trim(value)) <> 'feral'
      order by position
    ) as vibes_without_feral,
    case
      when exists (
        select 1
        from unnest(coalesce(kinks, '{}'::text[])) as kink_values(value)
        where lower(trim(value)) = 'feral'
      ) then kinks
      else array_append(coalesce(kinks, '{}'::text[]), 'feral')
    end as kinks_with_feral
  from profiles
  where exists (
    select 1
    from unnest(coalesce(vibes, '{}'::text[])) as vibe_values(value)
    where lower(trim(value)) = 'feral'
  )
)
update profiles
set
  vibes = feral_profiles.vibes_without_feral,
  kinks = feral_profiles.kinks_with_feral
from feral_profiles
where profiles.id = feral_profiles.id;
