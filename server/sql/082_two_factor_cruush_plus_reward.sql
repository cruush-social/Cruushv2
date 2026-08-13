-- New accounts can earn one promotional cruush+ day when they complete 2FA.
-- The cutover is written once by this migration so replay cannot move the
-- eligibility boundary or grant the promotion to older accounts.
insert into reward_settings (key, value)
values
  ('two_factor_promo_reward_days', '1'::jsonb),
  ('two_factor_promo_cutover_at', to_jsonb(clock_timestamp()))
on conflict (key) do nothing;
