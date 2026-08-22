insert into cruush_plus_promo_codes (
  code,
  label,
  grant_days,
  active,
  starts_at,
  expires_at
)
values (
  'NSFWCLUB30',
  'NSFW Club 30-day cruush+',
  30,
  true,
  now(),
  null
)
on conflict (code) do update
set label = excluded.label,
    grant_days = excluded.grant_days,
    active = excluded.active,
    expires_at = excluded.expires_at,
    updated_at = now();
