create table if not exists message_favorite_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  media_object_id uuid not null references media_objects(id) on delete cascade,
  label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_favorite_images_label_check
    check (char_length(label) <= 80),
  constraint message_favorite_images_unique_media
    unique (user_id, media_object_id)
);

create index if not exists message_favorite_images_user_created_idx
  on message_favorite_images (user_id, created_at desc);

create index if not exists message_favorite_images_media_idx
  on message_favorite_images (media_object_id);
