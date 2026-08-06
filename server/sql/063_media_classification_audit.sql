alter table media_objects
  add column if not exists explicit_classification_source text not null default 'provider',
  add column if not exists explicit_classification_updated_by uuid references app_users(id) on delete set null,
  add column if not exists explicit_classification_updated_at timestamptz,
  add column if not exists explicit_classification_reason text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'media_objects_explicit_classification_source_check'
  ) then
    alter table media_objects
      drop constraint media_objects_explicit_classification_source_check;
  end if;
end $$;

alter table media_objects
  add constraint media_objects_explicit_classification_source_check
  check (explicit_classification_source in ('provider', 'moderator', 'legacy_unknown'));

update media_objects
set explicit_classification = 'unknown',
    explicit_classification_source = 'legacy_unknown',
    explicit_classification_updated_at = coalesce(explicit_classification_updated_at, created_at),
    explicit_classification_reason = coalesce(explicit_classification_reason, 'Legacy media requires explicit reclassification.')
where legacy_asset = true
  and explicit_classification_source = 'provider'
  and moderation_provider is null;

create index if not exists idx_media_objects_legacy_reclassification
  on media_objects (created_at asc)
  where legacy_asset = true
    and explicit_classification = 'unknown'
    and deleted_at is null;
