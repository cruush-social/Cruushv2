create table if not exists side_quest_claims (
  user_id uuid not null references app_users(id) on delete cascade,
  quest_key text not null,
  reward_kind text not null,
  reward_amount integer not null default 1,
  claim_date date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_key),
  constraint side_quest_claims_quest_check check (quest_key in (
    'complete_profile', 'upload_four_photos', 'send_cruush', 'first_mutual_cruush', 'send_message',
    'post_feed', 'check_in_spot', 'post_spot_board'
  )),
  constraint side_quest_claims_reward_check check (
    (reward_kind = 'ping' and reward_amount between 1 and 5)
    or (reward_kind = 'cruush_plus_day' and reward_amount = 1)
  )
);

create unique index if not exists side_quest_claims_one_per_day
  on side_quest_claims (user_id, claim_date);

alter table map_pings
  add column if not exists bonus_credit_used boolean not null default false;

create index if not exists map_pings_bonus_credit_user_idx
  on map_pings (user_id, created_at desc)
  where bonus_credit_used = true;
