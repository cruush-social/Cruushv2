with owner_account as (
  select id
  from app_users
  where lower(email) = 'julienlenazny@gmail.com'
)
update app_users
set account_status = 'active',
    account_status_updated_at = now()
where id in (select id from owner_account);

with owner_account as (
  select id
  from app_users
  where lower(email) = 'julienlenazny@gmail.com'
)
insert into moderator_users (user_id, role)
select id, 'admin'
from owner_account
on conflict (user_id) do update
set role = 'admin';

with owner_account as (
  select id
  from app_users
  where lower(email) = 'julienlenazny@gmail.com'
)
delete from suspensions
where user_id in (select id from owner_account);

with owner_account as (
  select id
  from app_users
  where lower(email) = 'julienlenazny@gmail.com'
)
delete from feature_restrictions
where user_id in (select id from owner_account);
