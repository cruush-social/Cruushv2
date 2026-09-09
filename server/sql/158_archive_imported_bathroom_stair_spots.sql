-- Owner scope: retain public venues such as parks and gyms; remove Sniffies
-- bathroom/stair sublocation pins, whether or not a parent is listed.
-- No place or member data is deleted. Original records are retained once.
-- Rollback requires disabling this source-category rule and restoring the
-- recorded status after checking for subsequent moderator changes.
create table if not exists place_bathroom_stair_cleanup_20260909 (
  place_id uuid primary key,
  original_record jsonb not null,
  reason text not null,
  recorded_at timestamptz not null default now()
);

with eligible as (
  select p.* from places p
  where p.source_kind = 'community'
    and p.slug ~ '^public-place-[a-f0-9]{24}$'
    and (
      p.facility_type = 'staircase'
      or p.name ~* $pattern$\m(bathrooms?|restrooms?|washrooms?|toilets?|urinals?|staircases?|stairs|stairwells?|understall|wc|rstrms?|bthrms?)\M|\m(men['’]?s?|mens)\s+room\M$pattern$
    )
), backed_up as (
  insert into place_bathroom_stair_cleanup_20260909 (place_id, original_record, reason)
  select id, to_jsonb(eligible), 'Owner-requested removal of imported bathroom or stair sublocation'
  from eligible
  on conflict (place_id) do nothing
  returning place_id
)
update places p set status = 'archived', updated_at = now()
where p.status <> 'archived'
  and p.id in (select id from eligible)
  and (p.id in (select place_id from backed_up)
    or p.id in (select place_id from place_bathroom_stair_cleanup_20260909));
