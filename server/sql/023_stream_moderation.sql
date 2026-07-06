alter table content_reviews
  add column if not exists content_id text;

alter table content_reviews
  add column if not exists content_ref jsonb not null default '{}';

alter table content_reviews
  add column if not exists moderation_status text;

alter table content_reviews
  add column if not exists flagged_reason text;

alter table content_reviews
  add column if not exists moderation_provider text;

alter table content_reviews
  add column if not exists moderation_raw_result jsonb not null default '{}';

update content_reviews
set moderation_status = case
  when status in ('allowed', 'stored', 'delivered', 'published', 'closed') then 'allowed'
  when status in ('rejected', 'enforcement_applied') then 'blocked'
  else 'pending_review'
end
where moderation_status is null;

update content_reviews
set moderation_provider = provider
where moderation_provider is null;

alter table content_reviews
  alter column moderation_status set default 'pending_review';

alter table content_reviews
  alter column moderation_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_reviews_moderation_status_check'
  ) then
    alter table content_reviews
      add constraint content_reviews_moderation_status_check
      check (moderation_status in ('allowed', 'pending_review', 'blocked', 'removed', 'flagged'));
  end if;
end $$;

create index if not exists idx_content_reviews_automod_followup
  on content_reviews (moderation_status, completed_at, created_at desc)
  where moderation_status in ('pending_review', 'flagged');

create index if not exists idx_content_reviews_content_id
  on content_reviews (content_id)
  where content_id is not null;
