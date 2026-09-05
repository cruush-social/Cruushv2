-- A venue and its own bathroom were imported as two Spots, so one park or one
-- theatre showed up on the map several times over.
--
-- Only the unambiguous case is merged: a Spot whose name contains restroom,
-- bathroom or toilet AND contains its parent's name, within roughly 200m of
-- that parent. "Whole foods Bathroom" sitting near an AMC is a different venue
-- and is left alone; only "AMC RESTROOM" beside "AMC" is treated as the same
-- place.
--
-- The bathroom is not silently lost: the parent's description gains a line
-- saying the restrooms there are cruised, which is the part worth keeping.
--
-- Replay-safe: the note is only appended when it is not already present, and
-- the delete is a no-op once the rows are gone.
do $$
declare
  pair record;
begin
  for pair in
    with pairs as (
      select b.id as bathroom_id,
             p.id as parent_id,
             p.description as parent_desc,
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
       and length(p.name) >= 4
       and b.name ilike '%' || p.name || '%'
      where b.name ~* '(bathroom|restroom|toilet)'
    )
    select bathroom_id, parent_id, parent_desc from pairs where rn = 1
  loop
    update places
    set description = case
      when coalesce(pair.parent_desc, '') = '' then 'Restrooms here see cruising traffic.'
      when pair.parent_desc ilike '%restrooms here see cruising traffic%' then pair.parent_desc
      else pair.parent_desc || ' Restrooms here see cruising traffic.'
    end
    where id = pair.parent_id;

    delete from places where id = pair.bathroom_id;
  end loop;
end $$;
