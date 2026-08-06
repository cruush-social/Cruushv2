-- Keep recurring and referral promotions active, but issue exactly one week per grant.
-- The streak threshold advances one qualifying day after every grant: 7, 8, 9, ...
insert into reward_settings (key, value)
values
  ('recurring_streak_days', '7'::jsonb),
  ('recurring_streak_reward_days', '7'::jsonb),
  ('activity_reward_cap_days', 'null'::jsonb),
  ('eligible_activity_types', '["cruush","message","post"]'::jsonb),
  ('referral_reward_days', '7'::jsonb),
  ('referral_reward_cap_days', 'null'::jsonb)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
