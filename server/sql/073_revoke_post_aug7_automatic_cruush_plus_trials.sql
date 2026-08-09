-- Automatic first-login trials ended on August 7, 2026. Preserve the original
-- trial for earlier accounts and every reward earned through a referral or streak.
with target_grants as (
  select reward.id, reward.user_id, reward.days
  from reward_grants reward
  join app_users app_user on app_user.id = reward.user_id
  left join reward_grant_reversals reversal on reversal.grant_id = reward.id
  where reward.idempotency_key like 'first-login-cruush-plus-7d:%'
    and app_user.created_at >= timestamptz '2026-08-07 00:00:00-04'
    and reversal.id is null
), reversed_grants as (
  insert into reward_grant_reversals (
    grant_id,
    user_id,
    days,
    reason,
    audit_metadata
  )
  select
    id,
    user_id,
    days,
    'Automatic first-login cruush+ trial discontinued',
    jsonb_build_object(
      'reasonCode', 'automatic_first_login_trial_discontinued',
      'effectiveAt', '2026-08-07T00:00:00-04:00'
    )
  from target_grants
  on conflict (grant_id) do nothing
  returning user_id, days
)
update promotional_cruush_plus_entitlements entitlement
set banked_seconds = greatest(
      0,
      entitlement.banked_seconds - least(entitlement.banked_seconds, reversed_grants.days * 86400)
    ),
    active_until = case
      when reversed_grants.days * 86400 <= entitlement.banked_seconds then entitlement.active_until
      when entitlement.active_until is null or entitlement.active_until <= now() then entitlement.active_until
      else greatest(
        now(),
        entitlement.active_until - ((reversed_grants.days * 86400 - entitlement.banked_seconds) * interval '1 second')
      )
    end,
    updated_at = now()
from reversed_grants
where entitlement.user_id = reversed_grants.user_id;
