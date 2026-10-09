alter table support_requests
  add column if not exists contact_email_expires_at timestamptz,
  add column if not exists contact_email_opted_in boolean not null default false;

create index if not exists idx_support_requests_contact_email_expiry
  on support_requests (contact_email_expires_at)
  where contact_email_expires_at is not null;

-- Legacy addresses have no recorded opt-in. Do not infer consent or extend a
-- deadline on replay. Keep the requester constraint unchanged: an anonymous
-- non-survey report retains only a non-deliverable marker, not personal data.
-- Reply rows must be scrubbed before parents, matching account-deletion locks.
create or replace function redact_bug_support_reply_recipient()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  request_category text;
  requester_deleted_at timestamptz;
begin
  select request.category, request.requester_account_deleted_at
  into request_category, requester_deleted_at
  from support_requests request where request.id = new.support_request_id
  for share;

  if request_category = 'bug' then
    new.recipient_email := case when requester_deleted_at is not null
      then 'deleted-account@invalid' else 'bug-contact@invalid' end;
  end if;
  return new;
end;
$$;

drop trigger if exists support_request_replies_guard_bug_recipient on support_request_replies;
create trigger support_request_replies_guard_bug_recipient
before insert or update of support_request_id, recipient_email on support_request_replies
for each row execute function redact_bug_support_reply_recipient();

update support_request_replies reply
set recipient_email = case when request.requester_account_deleted_at is not null
  then 'deleted-account@invalid' else 'bug-contact@invalid' end
from support_requests request
where request.id = reply.support_request_id and request.category = 'bug'
  and reply.recipient_email not in ('bug-contact@invalid', 'deleted-account@invalid');

update support_requests
set contact_email = case when requester_user_id is null
    and requester_account_deleted_at is null and source <> 'survey'
  then 'bug-contact@invalid' else null end,
    contact_email_opted_in = false,
    contact_email_expires_at = null
where category = 'bug'
  and (not contact_email_opted_in or contact_email_expires_at is null
    or contact_email_expires_at <= now())
  and (contact_email_opted_in or contact_email_expires_at is not null
    or (contact_email is not null and contact_email <> 'bug-contact@invalid'));
