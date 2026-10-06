create table if not exists checkout_coupon_redemptions (
  user_id uuid not null references app_users(id) on delete cascade,
  coupon_code text not null,
  crypto_payment_intent_id uuid not null unique references crypto_payment_intents(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved', 'redeemed')),
  reserved_at timestamptz not null default now(),
  redeemed_at timestamptz,
  primary key (user_id, coupon_code),
  constraint checkout_coupon_redemptions_redeemed_at_check check (
    (status = 'reserved' and redeemed_at is null)
    or (status = 'redeemed' and redeemed_at is not null)
  )
);

create index if not exists checkout_coupon_redemptions_intent_idx
  on checkout_coupon_redemptions (crypto_payment_intent_id);

alter table side_quest_claims
  drop constraint if exists side_quest_claims_quest_check;

alter table side_quest_claims
  add constraint side_quest_claims_quest_check check (quest_key in (
    'complete_tutorial',
    'upload_first_photo', 'complete_profile', 'upload_four_photos', 'view_profile',
    'send_cruush', 'send_ping',
    'first_mutual_cruush', 'send_message', 'send_three_messages', 'post_feed',
    'post_three_feed', 'check_in_spot', 'post_spot_board', 'rate_spot',
    'save_visibility_set', 'join_club', 'send_club_message'
  ));
