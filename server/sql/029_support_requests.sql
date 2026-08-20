create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references app_users(id) on delete set null,
  requester_account_deleted_at timestamptz,
  contact_email text,
  category text not null check (category in ('bug', 'comment', 'question', 'policy')),
  subject text not null,
  message text not null,
  source text not null default 'unknown' check (source in ('auth', 'settings', 'policy', 'survey', 'unknown')),
  page_url text not null default '',
  ai_triage_status text not null default 'pending' check (ai_triage_status in ('pending', 'processing', 'complete', 'failed')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_requester_required_check check (
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
  )
);

-- Migrations replay on every deploy. Existing databases need this column before
-- the account-deletion integrity migration replaces the legacy requester check.
alter table support_requests
  add column if not exists requester_account_deleted_at timestamptz;

create index if not exists idx_support_requests_status_created_at
  on support_requests (status, created_at desc);

create index if not exists idx_support_requests_ai_triage_created_at
  on support_requests (ai_triage_status, created_at desc);

create index if not exists idx_support_requests_requester_created_at
  on support_requests (requester_user_id, created_at desc)
  where requester_user_id is not null;

create index if not exists idx_support_requests_contact_email_created_at
  on support_requests (lower(contact_email), created_at desc)
  where contact_email is not null;
