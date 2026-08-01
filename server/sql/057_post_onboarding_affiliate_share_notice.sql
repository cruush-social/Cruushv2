insert into user_notice_dismissals (user_id, notice_key)
select app_users.id, 'cruush:post-onboarding-affiliate-share-seen:' || app_users.id::text
from app_users
join profiles
  on profiles.id = app_users.id
where nullif(btrim(profiles.display_name), '') is not null
  and profiles.year_of_birth is not null
on conflict (user_id, notice_key) do nothing;
