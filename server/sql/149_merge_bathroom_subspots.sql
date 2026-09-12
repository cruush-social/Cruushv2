-- A venue and its own bathroom were imported as two Spots, so one park or one
-- theatre showed up on the map several times over.
--
-- Only the unambiguous case is merged: a Spot whose name contains restroom,
-- bathroom or toilet AND contains its parent's name, within roughly 200m of
-- that parent. "Whole foods Bathroom" sitting near an AMC is a different venue
-- and is left alone; only "AMC RESTROOM" beside "AMC" is treated as the same
-- place.
--
-- Archive the imported sub-Spot recoverably. Do not delete its member data or
-- invent a description for its parent. Archived/rejected rows remain untouched
-- when migrations replay.
do $$
declare
  pair record;
begin
  for pair in
    with pairs as (
      select b.id as bathroom_id,
             p.id as parent_id,
             row_number() over (
               partition by b.id
               order by abs(b.latitude - p.latitude) + abs(b.longitude - p.longitude)
             ) as rn
      from places b
      join places p
        on p.id <> b.id
       and abs(b.latitude - p.latitude) < 0.0018
       and abs(b.longitude - p.longitude) < 0.0018
       and p.name !~* '(bathroom|restroom|toilet)'
       and p.status = 'published'
       and length(p.name) >= 4
       and b.name ilike '%' || p.name || '%'
      where b.name ~* '(bathroom|restroom|toilet)'
        and b.status = 'published'
        and b.slug like 'public-place-%'
    )
    select bathroom_id, parent_id from pairs where rn = 1
  loop
    update places
    set status = 'archived', updated_at = now()
    where id = pair.bathroom_id and status = 'published';
  end loop;
end $$;
