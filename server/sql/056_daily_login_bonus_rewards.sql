insert into reward_settings (key, value)
values
  ('long_streak_days', '1'::jsonb),
  ('long_streak_bonus_days', '1'::jsonb),
  ('activity_reward_cap_days', '5'::jsonb)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
