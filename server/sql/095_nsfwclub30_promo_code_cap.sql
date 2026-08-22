-- Cap the NSFW Club coupon at 500 total redemptions. The cap is only applied
-- when it has never been set, so a later operator change to the limit survives
-- every migration replay.
update cruush_plus_promo_codes
set max_redemptions = 500,
    updated_at = now()
where upper(code) = 'NSFWCLUB30'
  and max_redemptions is null;
