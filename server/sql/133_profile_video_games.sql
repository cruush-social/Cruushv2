create or replace function pg_temp.cruush_profile_video_games_v16(input_values text[])
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
          when 'gaming' then 'Video games'
          when 'video games' then 'Video games'
          else item
        end as value,
        position
      from unnest(coalesce(input_values, '{}'::text[])) with ordinality as values_with_position(item, position)
      where trim(item) <> ''
    ) normalized_values
    group by value
  ) unique_values;
$$;

update profiles
set hobbies = pg_temp.cruush_profile_video_games_v16(hobbies)
where exists (
  select 1
  from unnest(coalesce(hobbies, '{}'::text[])) as hobby_values(value)
  where lower(trim(value)) in ('gaming', 'video games')
);
