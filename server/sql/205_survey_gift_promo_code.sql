insert into cruush_plus_promo_codes (code, label, grant_days, max_redemptions, active)
select 'SURVEYGIFT', 'Survey gift', 1, null, true
where not exists (
  select 1
  from cruush_plus_promo_codes
  where upper(code) = 'SURVEYGIFT'
);
