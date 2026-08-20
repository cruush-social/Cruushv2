alter table support_requests
  drop constraint if exists support_requests_source_check;

alter table support_requests
  add constraint support_requests_source_check
  check (source in ('auth', 'settings', 'policy', 'survey', 'unknown'));

alter table support_requests
  drop constraint if exists support_requests_requester_required_check;

alter table support_requests
  add constraint support_requests_requester_required_check
  check (
    (
      requester_account_deleted_at is null and
      (
        source = 'survey' or
        requester_user_id is not null or
        nullif(contact_email, '') is not null
      )
    ) or
    (
      requester_account_deleted_at is not null and
      requester_user_id is null and
      contact_email is null
    )
  );
