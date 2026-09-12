-- Archive imported retail-chain and retail-bathroom pins reviewed for the
-- Spot reduction. Preserve real public venues and every non-imported record.
create table if not exists place_retail_cleanup_20260911 (
  place_id uuid primary key,
  original_record jsonb not null,
  reason text not null,
  recorded_at timestamptz not null default now()
);

with eligible as (
  select p.* from places p
  where p.status = 'published'
    and p.source_kind = 'community'
    and p.slug ~ '^public-place-[a-f0-9]{24}$'
    and p.facility_type not in ('park','woods','beach','gym','hotel','transit','adult_venue','bar','sauna','music_venue')
    and p.name ~* $pattern$(target|home depot|walmart|walgreens|shop ?rite|stop ?[&and] shop|staples|best buy|lowe['’]?s|kohls|macys|macy['’]?s|whole foods|trader joe|aldi|rite aid|cvs|dollar tree|bed bath|neiman marcus|saks|marshalls|tj max|bathroom|restroom|washroom|men['’]?s room)$pattern$
), backed_up as (
  insert into place_retail_cleanup_20260911(place_id, original_record, reason)
  select id, to_jsonb(eligible), 'Reviewed Sniffies-only retail-chain or retail-bathroom pin'
  from eligible on conflict (place_id) do nothing returning place_id
)
update places p set status = 'archived', updated_at = now()
where p.id in (select place_id from backed_up) and p.status = 'published';
