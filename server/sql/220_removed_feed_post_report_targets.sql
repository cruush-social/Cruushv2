-- Preserve the original Feed target when the post itself is deleted. The
-- retained identifier intentionally has no FK back to the deleted content.
alter table reports
  add column if not exists removed_post_id uuid;

create or replace function preserve_removed_feed_post_report_target()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update reports
  set removed_post_id = old.id
  where post_id = old.id;

  return old;
end;
$$;

drop trigger if exists posts_preserve_report_target on posts;
create trigger posts_preserve_report_target
before delete on posts
for each row
execute function preserve_removed_feed_post_report_target();

-- Every other target branch, including real account deletion, is unchanged.
alter table reports
  drop constraint if exists reports_target_required_check;

alter table reports
  add constraint reports_target_required_check
  check (
    (target_account_deleted_at is not null and target_user_id is null and (target_type <> 'profile_photo' or profile_photo_url is null))
    or
    (target_account_deleted_at is null and (
      (target_type = 'user' and target_user_id is not null)
      or (target_type = 'profile' and target_user_id is not null)
      or (target_type = 'conversation' and conversation_id is not null)
      or (target_type = 'message' and message_id is not null)
      or (target_type = 'post' and (post_id is not null or (post_id is null and removed_post_id is not null)))
      or (target_type = 'profile_photo' and target_user_id is not null and (nullif(profile_photo_url, '') is not null or media_object_id is not null))
      or (target_type = 'place' and place_id is not null)
      or (target_type = 'place_message' and place_board_message_id is not null and target_user_id is not null)
    ))
  );
