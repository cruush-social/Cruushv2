-- Each survey has its own response. Answering the old survey must not silently
-- discard a later subscription survey response. Preserve every existing row.
drop index if exists support_requests_active_survey_requester_uidx;

create unique index support_requests_active_survey_requester_subject_uidx
  on support_requests (requester_user_id, subject)
  where source = 'survey'
    and requester_user_id is not null
    and requester_account_deleted_at is null
    and status in ('open', 'in_progress');
