create table if not exists message_media_attachments (
  message_id uuid not null references messages(id) on delete cascade,
  media_object_id uuid not null references media_objects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, media_object_id)
);

create index if not exists idx_message_media_attachments_media
  on message_media_attachments (media_object_id);
