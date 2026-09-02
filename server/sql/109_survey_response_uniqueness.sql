-- Keep one active survey response per signed-in member. Preserve older rows for
-- audit history, but remove them from active work by marking duplicates dismissed.
with ranked_active_surveys as (
  select
    id,
    row_number() over (
      partition by requester_user_id
      order by created_at desc, id desc
    ) as response_rank
  from support_requests
  where source = 'survey'
    and requester_user_id is not null
    and requester_account_deleted_at is null
    and status in ('open', 'in_progress')
)
update support_requests request
set status = 'dismissed',
    metadata = coalesce(request.metadata, '{}'::jsonb) || jsonb_build_object(
      'deduplicatedSurveyResponse', true
    ),
    updated_at = now()
from ranked_active_surveys ranked
where request.id = ranked.id
  and ranked.response_rank > 1;

create unique index if not exists support_requests_active_survey_requester_uidx
  on support_requests (requester_user_id)
  where source = 'survey'
    and requester_user_id is not null
    and requester_account_deleted_at is null
    and status in ('open', 'in_progress');
