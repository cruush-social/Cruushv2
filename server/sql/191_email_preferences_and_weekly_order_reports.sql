alter table notification_preferences
  add column if not exists email_enabled boolean not null default true;

create table if not exists weekly_order_reports (
  week_start date primary key,
  week_end date not null,
  claim_token uuid,
  claimed_until timestamptz,
  email_started_at timestamptz,
  email_sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_order_reports_range_check check (week_end = week_start + 7)
);

create index if not exists weekly_order_reports_pending_idx
  on weekly_order_reports (email_sent_at, claimed_until);
