with owner_account as (
  select id
  from app_users
  where lower(trim(email)) = 'julienlenazny@gmail.com'
)
update app_users
set account_status = 'active',
    account_status_updated_at = now()
where id in (select id from owner_account);

with owner_account as (
  select id
  from app_users
  where lower(trim(email)) = 'julienlenazny@gmail.com'
)
insert into user_trust_profiles (
  user_id,
  trust_score,
  trust_level,
  report_weight,
  max_future_trust,
  is_suspended
)
select id, 100, 'verified_trusted', 100, 100, false
from owner_account
on conflict (user_id) do update
set trust_score = 100,
    trust_level = 'verified_trusted',
    report_weight = 100,
    max_future_trust = 100,
    is_suspended = false,
    updated_at = now();

with owner_account as (
  select id
  from app_users
  where lower(trim(email)) = 'julienlenazny@gmail.com'
)
delete from suspensions
where user_id in (select id from owner_account);

with owner_account as (
  select id
  from app_users
  where lower(trim(email)) = 'julienlenazny@gmail.com'
)
delete from feature_restrictions
where user_id in (select id from owner_account);
