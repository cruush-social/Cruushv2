alter table support_requests
  add column if not exists requester_account_deleted_at timestamptz;

alter table reports
  add column if not exists target_account_deleted_at timestamptz;

-- PostgreSQL needs an index on the referencing side to avoid scanning every
-- message while an account-owned message cascade is in progress.
create index if not exists idx_messages_user_id
  on messages (user_id);

alter table support_requests
  drop constraint if exists support_requests_check;

alter table support_requests
  drop constraint if exists support_requests_requester_required_check;

alter table support_requests
  add constraint support_requests_requester_required_check
  check (
    (
      requester_account_deleted_at is null and
      (requester_user_id is not null or nullif(contact_email, '') is not null)
    ) or
    (
      requester_account_deleted_at is not null and
      requester_user_id is null and
      contact_email is null
    )
  );

alter table reports
  drop constraint if exists reports_target_required_check;

alter table reports
  add constraint reports_target_required_check
  check (
    (
      target_account_deleted_at is not null and
      target_user_id is null and
      (target_type <> 'profile_photo' or profile_photo_url is null)
    ) or
    (
      target_account_deleted_at is null and
      (
        (target_type = 'user' and target_user_id is not null) or
        (target_type = 'profile' and target_user_id is not null) or
        (target_type = 'conversation' and conversation_id is not null) or
        (target_type = 'message' and message_id is not null) or
        (target_type = 'post' and post_id is not null) or
        (
          target_type = 'profile_photo' and
          target_user_id is not null and
          (nullif(profile_photo_url, '') is not null or media_object_id is not null)
        )
      )
    )
  );

drop trigger if exists support_request_replies_anonymize_deleted_recipient
  on support_request_replies;

drop trigger if exists support_request_replies_guard_deleted_recipient
  on support_request_replies;

drop function if exists anonymize_deleted_support_reply_recipient();

create or replace function guard_deleted_support_reply_recipient()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  requester_deleted_at timestamptz;
begin
  select request.requester_account_deleted_at
  into requester_deleted_at
  from support_requests request
  where request.id = new.support_request_id
  for share;

  if requester_deleted_at is not null and new.recipient_email <> 'deleted-account@invalid' then
    raise exception using
      errcode = '23514',
      constraint = 'support_request_replies_active_requester_check',
      message = 'Cannot retain a reply address for a deleted account.';
  end if;

  return new;
end;
$$;

create trigger support_request_replies_guard_deleted_recipient
before insert or update of support_request_id, recipient_email
on support_request_replies
for each row
execute function guard_deleted_support_reply_recipient();

update support_request_replies reply
set recipient_email = 'deleted-account@invalid'
from support_requests request
where request.id = reply.support_request_id
  and request.requester_account_deleted_at is not null
  and reply.recipient_email <> 'deleted-account@invalid';

create or replace function preserve_account_deletion_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  deleted_at timestamptz := transaction_timestamp();
begin
  -- Lock existing replies before their parent requests. Reply writes use the
  -- same child-then-parent order, preventing a lock cycle during deletion.
  perform 1
  from support_request_replies reply
  join support_requests request on request.id = reply.support_request_id
  where request.requester_user_id = old.id
  order by reply.id
  for update of reply;

  update support_requests
  set requester_user_id = null,
      requester_account_deleted_at = coalesce(requester_account_deleted_at, deleted_at),
      contact_email = null
  where requester_user_id = old.id;

  -- Keep this as a separate statement so Read Committed sees a reply that
  -- committed while the parent update was waiting on its foreign-key lock.
  update support_request_replies reply
  set recipient_email = 'deleted-account@invalid'
  from support_requests request
  where request.id = reply.support_request_id
    and request.requester_account_deleted_at = deleted_at
    and reply.recipient_email <> 'deleted-account@invalid';

  -- Lock every report this deletion will update or cascade-delete in a stable
  -- order so concurrent deletion of mutually reported accounts cannot deadlock.
  perform 1
  from reports report
  where report.reporter_user_id = old.id
    or report.target_user_id = old.id
    or (
      report.target_type = 'post' and
      exists (
        select 1
        from posts post
        where post.id = report.post_id
          and post.user_id = old.id
      )
    )
    or (
      report.target_type = 'message' and
      exists (
        select 1
        from messages message
        where message.id = report.message_id
          and message.user_id = old.id
      )
    )
  order by report.id
  for update;

  -- Current report creation stores the target account for every target type.
  update reports
  set target_user_id = null,
      target_account_deleted_at = coalesce(target_account_deleted_at, deleted_at),
      profile_photo_url = case
        when target_type = 'profile_photo' then null
        else profile_photo_url
      end
  where target_user_id = old.id;

  -- Older rows can identify post and message owners only through their content.
  -- Mark them before the content cascade clears post_id or message_id.
  update reports report
  set target_user_id = null,
      target_account_deleted_at = coalesce(report.target_account_deleted_at, deleted_at)
  where report.target_account_deleted_at is null
    and report.target_type = 'post'
    and exists (
      select 1
      from posts post
      where post.id = report.post_id
        and post.user_id = old.id
    );

  update reports report
  set target_user_id = null,
      target_account_deleted_at = coalesce(report.target_account_deleted_at, deleted_at)
  where report.target_account_deleted_at is null
    and report.target_type = 'message'
    and exists (
      select 1
      from messages message
      where message.id = report.message_id
        and message.user_id = old.id
    );

  return old;
end;
$$;

drop trigger if exists app_users_preserve_account_deletion_evidence on app_users;

create trigger app_users_preserve_account_deletion_evidence
before delete on app_users
for each row
execute function preserve_account_deletion_evidence();
