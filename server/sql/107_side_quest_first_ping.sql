alter table side_quest_claims
  drop constraint if exists side_quest_claims_quest_check;

alter table side_quest_claims
  add constraint side_quest_claims_quest_check check (quest_key in (
    'complete_profile', 'upload_four_photos', 'send_cruush', 'send_ping', 'first_mutual_cruush',
    'send_message', 'post_feed', 'check_in_spot', 'post_spot_board'
  ));
