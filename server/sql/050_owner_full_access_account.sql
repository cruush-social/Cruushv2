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
  where lower(email) = 'julienlenazny@gmail.com'
)
insert into user_entitlements (
  user_id,
  cruush_plus_enabled,
  cruush_plus_expires_at,
  updated_at
)
select id, true, null, now()
from owner_account
on conflict (user_id) do update
set cruush_plus_enabled = true,
    cruush_plus_expires_at = null,
    updated_at = now();

with owner_account as (
  select id
  from app_users
  where lower(email) = 'julienlenazny@gmail.com'
)
insert into cruush_plus_lifetime_access (
  user_id,
  plan_id,
  test_mode
)
select id, 'lifetime_founder', true
from owner_account
on conflict (user_id) do update
set plan_id = 'lifetime_founder',
    test_mode = true;

with owner_account as (
  select id
  from app_users
  where lower(email) = 'julienlenazny@gmail.com'
)
insert into user_badges (
  user_id,
  badge_key,
  source_plan_id,
  permanent
)
select id, 'lifetime_founder', 'lifetime_founder', true
from owner_account
on conflict (user_id, badge_key) do update
set source_plan_id = 'lifetime_founder',
    permanent = true;

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
