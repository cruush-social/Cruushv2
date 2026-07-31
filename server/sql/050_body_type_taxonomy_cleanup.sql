create or replace function pg_temp.cruush_moved_body_type_vibe_values(values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(value order by value), '{}'::text[])
  from (
    select distinct
      case lower(item)
        when 'bear' then 'bear'
        when 'otter' then 'otter'
        when 'twink' then 'twink'
      end as value
    from unnest(coalesce(values, '{}'::text[])) as items(item)
    where lower(item) in ('bear', 'otter', 'twink')
  ) moved
  where value is not null;
$$;

create or replace function pg_temp.cruush_without_body_type_vibe_values(values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(item order by ord), '{}'::text[])
  from unnest(coalesce(values, '{}'::text[])) with ordinality as items(item, ord)
  where lower(item) not in ('bear', 'otter', 'twink');
$$;

update profiles
set
  body_type = (
    select coalesce(array_agg(distinct value order by value), '{}'::text[])
    from (
      select
        case lower(raw_value)
          when 'bbw' then 'BBW'
          when 'bbm' then 'BBM'
          when 'bear' then 'bear'
          when 'otter' then 'otter'
          when 'twink' then 'twink'
          else raw_value
        end as value
      from unnest(
        coalesce(body_type, '{}'::text[]) ||
        pg_temp.cruush_moved_body_type_vibe_values(
          coalesce(vibes, '{}'::text[]) ||
          coalesce(scenes, '{}'::text[]) ||
          coalesce(archetypes, '{}'::text[])
        )
      ) as body_values(raw_value)
      where raw_value is not null and raw_value <> ''
    ) canonical_body_values
  ),
  vibes = pg_temp.cruush_without_body_type_vibe_values(vibes),
  scenes = pg_temp.cruush_without_body_type_vibe_values(scenes),
  archetypes = pg_temp.cruush_without_body_type_vibe_values(archetypes)
where exists (
  select 1
  from unnest(
    coalesce(body_type, '{}'::text[]) ||
    coalesce(vibes, '{}'::text[]) ||
    coalesce(scenes, '{}'::text[]) ||
    coalesce(archetypes, '{}'::text[])
  ) as existing_values(value)
  where lower(value) in ('bbw', 'bbm', 'bear', 'otter', 'twink')
);
