-- Account deletion normally cascades app_users -> profiles -> posts. Remove
-- stale rows from older databases and hide soft-deleted authors consistently.
delete from posts post
using profiles profile
left join app_users author on author.id = profile.id
where profile.id = post.user_id
  and (author.id is null or author.account_status = 'deleted');
