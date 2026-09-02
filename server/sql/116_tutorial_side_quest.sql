create table if not exists tutorial_completions (
  user_id uuid primary key references app_users(id) on delete cascade,
  completed_at timestamptz not null default now()
);

alter table side_quest_claims
  drop constraint if exists side_quest_claims_quest_check;

alter table side_quest_claims
  add constraint side_quest_claims_quest_check check (quest_key in (
    'complete_tutorial',
    'upload_first_photo', 'complete_profile', 'upload_four_photos', 'view_profile',
    'send_cruush', 'send_ping',
    'first_mutual_cruush', 'send_message', 'send_three_messages', 'post_feed',
    'post_three_feed', 'check_in_spot', 'post_spot_board', 'rate_spot',
    'save_visibility_set'
  ));
