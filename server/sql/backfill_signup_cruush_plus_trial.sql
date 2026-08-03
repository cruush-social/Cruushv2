-- Backfill the 7-day welcome trial for accounts created before the signup grant shipped.
--
-- NOT in the migrate.ts migration list on purpose: this hands cruush+ to every existing
-- free account and should be run deliberately, once, not automatically on deploy.
--
--   psql "$DATABASE_URL" -f server/sql/backfill_signup_cruush_plus_trial.sql
--
-- Safe to re-run: reward_grants.idempotency_key is unique per user, and active_until
-- only ever moves forward via greatest().

begin;

with eligible as (
  select u.id as user_id
  from app_users u
  where not exists (
    select 1
    from reward_grants existing
    where existing.idempotency_key = 'signup-trial:' || u.id::text
  )
),
promo_row as (
  insert into promotional_cruush_plus_entitlements (user_id)
  select user_id from eligible
  on conflict (user_id) do update set user_id = excluded.user_id
  returning user_id
),
granted as (
  insert into reward_grants (user_id, source, days, idempotency_key, milestone_key, audit_metadata)
  select
    user_id,
    'admin',
    7,
    'signup-trial:' || user_id::text,
    'signup-trial:' || user_id::text,
    jsonb_build_object('offer', 'signup_trial', 'backfill', true)
  from eligible
  on conflict (idempotency_key) do nothing
  returning user_id
)
update promotional_cruush_plus_entitlements promotion
set active_until = greatest(coalesce(promotion.active_until, now()), now() + interval '7 days'),
    updated_at = now()
from granted
where promotion.user_id = granted.user_id;

commit;
