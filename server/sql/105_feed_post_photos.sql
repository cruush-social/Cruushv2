do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'media_objects_surface_check'
      and conrelid = 'media_objects'::regclass
  ) then
    alter table media_objects
      drop constraint media_objects_surface_check;
  end if;
end $$;

alter table media_objects
  add constraint media_objects_surface_check
  check (surface in ('profile_photo', 'private_photo', 'message_photo', 'message_media', 'feed_photo'));

create table if not exists feed_post_attachments (
  post_id uuid not null references posts(id) on delete cascade,
  media_object_id uuid not null references media_objects(id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  created_at timestamptz not null default now(),
  primary key (post_id, media_object_id),
  unique (post_id, position),
  unique (media_object_id)
);

create index if not exists idx_feed_post_attachments_post_position
  on feed_post_attachments (post_id, position);

create or replace function assert_feed_attachment_media_approved()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from media_objects media
    join posts post on post.id = new.post_id
    where media.id = new.media_object_id
      and media.owner_user_id = post.user_id
      and media.surface = 'feed_photo'
      and media.moderation_status = 'approved'
      and media.deleted_at is null
  ) then
    raise exception 'feed attachment must reference approved owner media'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists feed_attachments_approved_media_only on feed_post_attachments;
create constraint trigger feed_attachments_approved_media_only
after insert or update on feed_post_attachments
deferrable initially deferred
for each row
execute function assert_feed_attachment_media_approved();
