alter table reports
  add column if not exists content_review_id uuid references content_reviews(id) on delete set null;

update reports report
set content_review_id = linked_review.id
from (
  select distinct on (content_ref ->> 'reportId')
    id,
    content_ref ->> 'reportId' as report_id
  from content_reviews
  where provider = 'user_report'
    and nullif(content_ref ->> 'reportId', '') is not null
  order by content_ref ->> 'reportId', created_at desc
) linked_review
where report.content_review_id is null
  and report.id::text = linked_review.report_id;

create unique index if not exists idx_reports_content_review_id
  on reports (content_review_id)
  where content_review_id is not null;

create index if not exists idx_content_reviews_moderator_queue
  on content_reviews (moderation_status, created_at desc)
  where moderation_status <> 'allowed';

create table if not exists moderation_access_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id) on delete set null,
  report_id uuid references reports(id) on delete set null,
  content_review_id uuid references content_reviews(id) on delete set null,
  media_object_id uuid references media_objects(id) on delete set null,
  access_type text not null check (access_type in (
    'queue_detail',
    'media_preview',
    'review_preview'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_access_events_actor_created
  on moderation_access_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists idx_moderation_access_events_report_created
  on moderation_access_events (report_id, created_at desc)
  where report_id is not null;

create index if not exists idx_moderation_access_events_review_created
  on moderation_access_events (content_review_id, created_at desc)
  where content_review_id is not null;

create index if not exists idx_moderation_access_events_retention
  on moderation_access_events (created_at, id);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'moderation_actions_action_check'
  ) then
    alter table moderation_actions
      drop constraint moderation_actions_action_check;
  end if;
end $$;

alter table moderation_actions
  add constraint moderation_actions_action_check
  check (action in (
    'resolve_report',
    'dismiss_report',
    'approve_content',
    'reject_content',
    'suspend_user',
    'mark_under_review',
    'unsuspend_user',
    'restrict_feature',
    'remove_post',
    'remove_media',
    'remove_message',
    'restore_user',
    'note'
  ));
