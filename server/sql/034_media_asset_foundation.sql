alter table media_objects
  alter column public_url drop not null,
  alter column moderation_status set default 'pending';

alter table media_objects
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists moderation_provider text,
  add column if not exists moderation_provider_version text,
  add column if not exists moderation_scores jsonb not null default '[]'::jsonb,
  add column if not exists moderation_decided_at timestamptz,
  add column if not exists moderation_failure_reason text,
  add column if not exists explicit_classification text not null default 'unknown',
  add column if not exists content_review_id uuid references content_reviews(id) on delete set null,
  add column if not exists legacy_asset boolean not null default false;

update media_objects
set moderation_status = case moderation_status
  when 'allowed' then 'approved'
  when 'approved' then 'approved'
  when 'approved_explicit' then 'approved_explicit'
  when 'pending' then 'pending'
  when 'pending_review' then 'pending'
  when 'rejected' then 'rejected'
  when 'blocked' then 'rejected'
  when 'removed' then 'rejected'
  when 'failed' then 'failed'
  else 'failed'
end;

update media_objects
set legacy_asset = true,
    moderation_decided_at = coalesce(moderation_decided_at, created_at),
    explicit_classification = case
      when explicit_classification = 'unknown' then 'non_explicit'
      else explicit_classification
    end
where moderation_status = 'approved'
  and (
    object_key like 'profile-photos/%'
    or object_key like 'message-photos/%'
  );

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'media_objects_moderation_status_check'
  ) then
    alter table media_objects
      drop constraint media_objects_moderation_status_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'media_objects_explicit_classification_check'
  ) then
    alter table media_objects
      drop constraint media_objects_explicit_classification_check;
  end if;
end $$;

alter table media_objects
  add constraint media_objects_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'approved_explicit', 'rejected', 'failed'));

alter table media_objects
  add constraint media_objects_explicit_classification_check
  check (explicit_classification in ('unknown', 'non_explicit', 'explicit', 'uncertain'));

create table if not exists media_variants (
  id uuid primary key default gen_random_uuid(),
  media_object_id uuid not null references media_objects(id) on delete cascade,
  variant_type text not null check (variant_type in ('thumbnail', 'display')),
  object_key text not null unique,
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size integer not null check (byte_size > 0),
  encrypted_data_key text not null,
  data_key_nonce text not null,
  data_key_auth_tag text not null,
  content_nonce text not null,
  content_auth_tag text not null,
  key_version text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_media_variants_active_type
  on media_variants (media_object_id, variant_type)
  where deleted_at is null;

create index if not exists idx_media_objects_owner_surface_status
  on media_objects (owner_user_id, surface, moderation_status, created_at desc)
  where deleted_at is null;

create table if not exists legacy_media_quarantine (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references app_users(id) on delete cascade,
  photo_url text not null,
  original_position integer not null,
  reason text not null default 'missing_approved_media_record',
  quarantined_at timestamptz not null default now(),
  unique (owner_user_id, photo_url)
);

insert into legacy_media_quarantine (owner_user_id, photo_url, original_position)
select profile.id, photo.value, photo.ordinality::integer
from profiles profile
cross join lateral unnest(coalesce(profile.photos, '{}'::text[])) with ordinality as photo(value, ordinality)
where not exists (
  select 1
  from media_objects media
  where media.owner_user_id = profile.id
    and media.public_url = photo.value
    and media.moderation_status = 'approved'
    and media.deleted_at is null
)
on conflict (owner_user_id, photo_url) do nothing;

update profiles profile
set photos = coalesce((
  select array_agg(photo.value order by photo.ordinality)
  from unnest(coalesce(profile.photos, '{}'::text[])) with ordinality as photo(value, ordinality)
  where exists (
    select 1
    from media_objects media
    where media.owner_user_id = profile.id
      and media.public_url = photo.value
      and media.moderation_status = 'approved'
      and media.deleted_at is null
  )
), '{}'::text[])
where coalesce(array_length(profile.photos, 1), 0) > 0;

create or replace function assert_profile_photos_approved()
returns trigger
language plpgsql
as $$
declare
  photo_url text;
begin
  foreach photo_url in array coalesce(new.photos, '{}'::text[])
  loop
    if not exists (
      select 1
      from media_objects media
      where media.owner_user_id = new.id
        and media.public_url = photo_url
        and media.surface = 'profile_photo'
        and media.moderation_status = 'approved'
        and media.deleted_at is null
    ) then
      raise exception 'profile photo must reference approved owner media'
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_approved_photos_only on profiles;
create constraint trigger profiles_approved_photos_only
after insert or update on profiles
deferrable initially deferred
for each row
execute function assert_profile_photos_approved();

create or replace function assert_message_attachment_media_approved()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from media_objects media
    where media.id = new.media_object_id
      and media.surface = 'message_photo'
      and media.moderation_status = 'approved'
      and media.deleted_at is null
  ) then
    raise exception 'message attachment must reference approved media'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists message_attachments_approved_media_only on message_media_attachments;
create constraint trigger message_attachments_approved_media_only
after insert or update on message_media_attachments
deferrable initially deferred
for each row
execute function assert_message_attachment_media_approved();
