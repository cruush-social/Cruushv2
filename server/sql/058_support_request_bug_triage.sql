alter table support_requests
  add column if not exists dedupe_hash text;

alter table support_requests
  add column if not exists github_issue_number integer;

alter table support_requests
  add column if not exists triage_branch text;

alter table support_requests
  add column if not exists triage_pr_url text;

alter table support_requests
  add column if not exists triage_attempts integer not null default 0;

alter table support_requests
  add column if not exists triage_claimed_at timestamptz;

create index if not exists idx_support_requests_dedupe_hash_created_at
  on support_requests (dedupe_hash, created_at)
  where dedupe_hash is not null;

-- Not unique: duplicate reports intentionally attach to the same issue.
create index if not exists idx_support_requests_github_issue_number
  on support_requests (github_issue_number)
  where github_issue_number is not null;

create index if not exists idx_support_requests_bug_queue
  on support_requests (ai_triage_status, created_at)
  where category = 'bug';
