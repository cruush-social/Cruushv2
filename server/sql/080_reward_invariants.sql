-- Lock the approved daily check-in reward rule at the database boundary.
-- Existing grants and legacy activity credits remain untouched.
drop trigger if exists reward_settings_daily_check_in_guard on reward_settings;

insert into reward_settings (key, value)
values
  ('recurring_streak_days', '7'::jsonb),
  ('recurring_streak_reward_days', '1'::jsonb),
  ('activity_reward_cap_days', '5'::jsonb),
  ('activity_reward_cap_period_days', '30'::jsonb),
  ('eligible_activity_types', '["check_in"]'::jsonb)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function enforce_daily_check_in_reward_settings()
returns trigger
language plpgsql
as $$
declare
  expected_value jsonb;
begin
  expected_value := case new.key
    when 'recurring_streak_days' then '7'::jsonb
    when 'recurring_streak_reward_days' then '1'::jsonb
    when 'activity_reward_cap_days' then '5'::jsonb
    when 'activity_reward_cap_period_days' then '30'::jsonb
    when 'eligible_activity_types' then '["check_in"]'::jsonb
    else null
  end;

  if expected_value is not null and new.value is distinct from expected_value then
    raise exception 'unsafe daily check-in reward setting is forbidden'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger reward_settings_daily_check_in_guard
before insert or update on reward_settings
for each row execute function enforce_daily_check_in_reward_settings();

alter table daily_activity_credits
  drop constraint if exists daily_activity_credits_check_in_only;
alter table daily_activity_credits
  add constraint daily_activity_credits_check_in_only
  check (activity_type = 'check_in') not valid;

alter table reward_grants
  drop constraint if exists reward_grants_check_in_only_shape;
alter table reward_grants
  add constraint reward_grants_check_in_only_shape
  check (
    source not in ('activity_recurring', 'activity_long_bonus')
    or (source = 'activity_recurring' and days = 1)
  ) not valid;
