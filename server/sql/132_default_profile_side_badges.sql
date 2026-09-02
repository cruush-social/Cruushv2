update profiles
set side_badges = jsonb_build_object(
  'left', case
    when side_badges->'left' is null or side_badges->'left' = 'null'::jsonb then
      case when nullif(trim(coalesce(role[1], '')), '') is null then 'null'::jsonb
      else jsonb_build_object(
        'badge_id', trim(role[1]),
        'intent', 'none',
        'frame', 'circle'
      ) end
    else side_badges->'left'
  end,
  'right', case
    when side_badges->'right' is null or side_badges->'right' = 'null'::jsonb then
      case when nullif(trim(coalesce(position[1], '')), '') is null then 'null'::jsonb
      else jsonb_build_object(
        'badge_id', trim(position[1]),
        'intent', 'none',
        'frame', 'circle'
      ) end
    else side_badges->'right'
  end
)
where
  (
    (side_badges->'left' is null or side_badges->'left' = 'null'::jsonb)
    and nullif(trim(coalesce(role[1], '')), '') is not null
  )
  or (
    (side_badges->'right' is null or side_badges->'right' = 'null'::jsonb)
    and nullif(trim(coalesce(position[1], '')), '') is not null
  );
