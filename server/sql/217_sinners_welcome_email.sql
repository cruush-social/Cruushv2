-- Additive outbox only. No historical acceptance or location backfill.
create table if not exists sinners_welcome_emails (
  event_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  event_kind text not null check (event_kind in ('first_coc', 'service_return')),
  prior_outside_event_id uuid,
  idempotency_key text not null unique,
  queued_at timestamptz not null default now(),
  claim_token uuid,
  claimed_until timestamptz,
  email_started_at timestamptz,
  email_to text,
  email_sent_at timestamptz,
  provider_message_id text,
  reconciliation_required_at timestamptz,
  check ((event_kind = 'service_return') = (prior_outside_event_id is not null))
);

create unique index if not exists sinners_welcome_first_coc_idx
  on sinners_welcome_emails (user_id) where event_kind = 'first_coc';
create unique index if not exists sinners_welcome_return_idx
  on sinners_welcome_emails (prior_outside_event_id) where event_kind = 'service_return';
create index if not exists sinners_welcome_pending_idx
  on sinners_welcome_emails (coalesce(claimed_until, queued_at), queued_at, event_id)
  where email_sent_at is null and reconciliation_required_at is null;
create index if not exists sinners_welcome_user_idx on sinners_welcome_emails (user_id);
