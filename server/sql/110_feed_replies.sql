create table if not exists feed_post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  content text not null default '[encrypted]',
  content_ciphertext text not null,
  content_nonce text not null,
  content_auth_tag text not null,
  content_key_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists feed_post_replies_post_created_idx
  on feed_post_replies (post_id, created_at, id);

create index if not exists feed_post_replies_user_created_idx
  on feed_post_replies (user_id, created_at desc);
