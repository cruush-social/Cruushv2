create table if not exists feed_post_tags (
  post_id uuid not null references posts(id) on delete cascade,
  tag text not null check (tag ~ '^[a-z0-9_]{1,24}$'),
  position smallint not null check (position between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (post_id, tag),
  unique (post_id, position)
);

create index if not exists idx_feed_post_tags_tag
  on feed_post_tags (tag, post_id);
