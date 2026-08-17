-- Remove stale local-feed posts whose author profile or account no longer exists.
delete from posts post
where not exists (
  select 1
  from profiles profile
  where profile.id = post.user_id
)
or exists (
  select 1
  from app_users author
  where author.id = post.user_id
    and author.account_status = 'deleted'
);
