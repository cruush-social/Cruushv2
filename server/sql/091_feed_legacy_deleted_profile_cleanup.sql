-- Older account-removal flows replaced the display name without marking the
-- account deleted. Remove only their feed posts; current account state and
-- moderation evidence remain untouched.
delete from posts post
using profiles profile
where profile.id = post.user_id
  and lower(trim(coalesce(profile.display_name, ''))) = 'user deleted profile';
