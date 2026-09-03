-- Replay guard: once 116_tutorial_side_quest.sql has installed the final
-- quest list, re-adding this older, narrower list would fail on rows earned
-- since (for example view_profile). Skip the constraint churn in that case.
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'tutorial_completions') then
    return;
  end if;

  alter table side_quest_claims
    drop constraint if exists side_quest_claims_quest_check;

  alter table side_quest_claims
    add constraint side_quest_claims_quest_check check (quest_key in (
      'complete_profile', 'upload_four_photos', 'send_cruush', 'send_ping', 'first_mutual_cruush',
      'send_message', 'post_feed', 'check_in_spot', 'post_spot_board'
    ));
end $$;
