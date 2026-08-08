do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'media_objects_surface_check'
  ) then
    alter table media_objects
      drop constraint media_objects_surface_check;
  end if;
end $$;

alter table media_objects
  add constraint media_objects_surface_check
  check (surface in ('profile_photo', 'private_photo', 'message_photo', 'message_media', 'feed_photo'));

create table if not exists feed_post_media_attachments (
  post_id uuid not null references posts(id) on delete cascade,
  media_object_id uuid not null references media_objects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, media_object_id),
  unique (post_id)
);

create index if not exists idx_feed_post_media_attachments_media
  on feed_post_media_attachments (media_object_id);

create or replace function assert_feed_post_attachment_media_approved()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from media_objects media
    where media.id = new.media_object_id
      and media.surface = 'feed_photo'
      and media.moderation_status = 'approved'
      and media.deleted_at is null
  ) then
    raise exception 'feed post attachment must reference approved media'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists feed_post_attachments_approved_media_only on feed_post_media_attachments;
create constraint trigger feed_post_attachments_approved_media_only
after insert or update on feed_post_media_attachments
deferrable initially deferred
for each row
execute function assert_feed_post_attachment_media_approved();
