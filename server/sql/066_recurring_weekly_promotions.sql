-- Keep recurring check-in and referral promotions active during every migration replay.
-- Check-in rewards issue one day at completed seven-day boundaries: 7, 14, 21, ...
insert into reward_settings (key, value)
values
  ('recurring_streak_days', '7'::jsonb),
  ('recurring_streak_reward_days', '1'::jsonb),
  ('activity_reward_cap_days', '5'::jsonb),
  ('activity_reward_cap_period_days', '30'::jsonb),
  ('eligible_activity_types', '["check_in"]'::jsonb),
  ('referral_reward_days', '7'::jsonb),
  ('referral_reward_cap_days', 'null'::jsonb)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
