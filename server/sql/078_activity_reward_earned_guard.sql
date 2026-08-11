-- Keep the pre-079 grant guard fail-closed during every migration replay.
create or replace function enforce_activity_reward_earned_boundary()
returns trigger
language plpgsql
as $$
declare
  boundary_days integer;
  configured_reward_days integer;
  configured_cap_days integer;
  configured_cap_period_days integer;
  configured_activity_types jsonb;
  streak_value integer;
  activity_date_value date;
  persisted_streak integer;
  persisted_activity_date date;
  previously_granted_days integer;
begin
  if new.source = 'activity_long_bonus' then
    raise exception 'legacy activity bonus grants are disabled'
      using errcode = '23514';
  end if;

  if new.source <> 'activity_recurring' then
    return new;
  end if;

  if coalesce(new.audit_metadata->>'streak', '') !~ '^[0-9]+$'
     or coalesce(new.audit_metadata->>'activityDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'activity reward requires valid earned check-in evidence'
      using errcode = '23514';
  end if;

  streak_value := (new.audit_metadata->>'streak')::integer;
  activity_date_value := (new.audit_metadata->>'activityDate')::date;

  select coalesce(
    (select nullif(setting.value #>> '{}', '')::integer
     from reward_settings setting where setting.key = 'recurring_streak_days'),
    7
  ) into boundary_days;

  select coalesce(
    (select nullif(setting.value #>> '{}', '')::integer
     from reward_settings setting where setting.key = 'recurring_streak_reward_days'),
    1
  ) into configured_reward_days;

  select coalesce(
    (select nullif(setting.value #>> '{}', '')::integer
     from reward_settings setting where setting.key = 'activity_reward_cap_days'),
    5
  ) into configured_cap_days;

  select coalesce(
    (select nullif(setting.value #>> '{}', '')::integer
     from reward_settings setting where setting.key = 'activity_reward_cap_period_days'),
    30
  ) into configured_cap_period_days;

  select coalesce(
    (select setting.value
     from reward_settings setting where setting.key = 'eligible_activity_types'),
    '["check_in"]'::jsonb
  ) into configured_activity_types;

  if boundary_days is distinct from 7
     or configured_reward_days is distinct from 1
     or configured_cap_days is distinct from 5
     or configured_cap_period_days is distinct from 30
     or configured_activity_types is distinct from '["check_in"]'::jsonb then
    raise exception 'activity reward configuration must remain seven check-ins, one reward day, and five days per rolling 30 days'
      using errcode = '23514';
  end if;

  perform 1
  from app_users app_user
  where app_user.id = new.user_id
  for update;

  select streak.current_streak, streak.last_activity_date
  into persisted_streak, persisted_activity_date
  from user_activity_streaks streak
  where streak.user_id = new.user_id;

  if streak_value < boundary_days
     or mod(streak_value, boundary_days) <> 0
     or new.days <> configured_reward_days
     or new.milestone_key is distinct from 'streak:' || streak_value::text
     or new.idempotency_key is distinct from
       'activity:recurring:' || new.user_id::text || ':' || streak_value::text
     or persisted_streak is distinct from streak_value
     or persisted_activity_date is distinct from activity_date_value
     or not exists (
       select 1
       from daily_activity_credits credit
       where credit.user_id = new.user_id
         and credit.activity_date = activity_date_value
         and credit.activity_type = 'check_in'
     ) then
    raise exception 'activity reward requires a completed seven-day check-in boundary'
      using errcode = '23514';
  end if;

  select coalesce(sum(reward.days), 0)::integer
  into previously_granted_days
  from reward_grants reward
  left join reward_grant_reversals reversal on reversal.grant_id = reward.id
  where reward.user_id = new.user_id
    and reward.source in ('activity_recurring', 'activity_long_bonus')
    and reward.created_at >= now() - (configured_cap_period_days * interval '1 day')
    and reversal.id is null;

  if previously_granted_days + new.days > configured_cap_days then
    raise exception 'activity reward exceeds the rolling 30-day cap'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists reward_grants_activity_earned_boundary_guard on reward_grants;
create trigger reward_grants_activity_earned_boundary_guard
before insert on reward_grants
for each row execute function enforce_activity_reward_earned_boundary();
