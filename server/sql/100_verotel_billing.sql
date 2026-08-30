-- Verotel FlexPay support for cruush+ billing.
--
-- Additive only. No table, column, index, or row is dropped. The single
-- constraint replacement widens the allowed processor set from ('fake') to
-- ('fake', 'verotel'); every row that satisfied the old constraint satisfies
-- the new one, so this is safe to replay on an existing database.

alter table if exists billing_checkout_sessions
  drop constraint if exists billing_checkout_sessions_processor_check;

alter table if exists billing_checkout_sessions
  add constraint billing_checkout_sessions_processor_check
  check (processor in ('fake', 'verotel'));

alter table if exists billing_checkout_sessions
  add column if not exists verotel_sale_id text;

alter table if exists billing_checkout_sessions
  add column if not exists verotel_reference_id text;

create index if not exists billing_checkout_sessions_verotel_sale_idx
  on billing_checkout_sessions (verotel_sale_id)
  where verotel_sale_id is not null;

-- Every postback Verotel sends, stored raw and exactly once.
--
-- The unique constraint on (sale_id, event_type, event_key) is the idempotency
-- guarantee: a re-delivered postback conflicts instead of granting cruush+ a
-- second time. event_key separates repeated events of the same type on one
-- sale, such as successive rebills, and is the postback's own transaction
-- identifier where Verotel supplies one.
create table if not exists billing_processor_events (
  id uuid primary key default gen_random_uuid(),
  processor text not null default 'verotel',
  sale_id text not null,
  event_type text not null,
  event_key text not null default '',
  checkout_session_id uuid references billing_checkout_sessions(id) on delete set null,
  user_id uuid references app_users(id) on delete set null,
  signature_verified boolean not null,
  applied boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint billing_processor_events_processor_check
    check (processor in ('verotel')),
  constraint billing_processor_events_unique
    unique (processor, sale_id, event_type, event_key)
);

create index if not exists billing_processor_events_user_received_idx
  on billing_processor_events (user_id, received_at desc);

create index if not exists billing_processor_events_unverified_idx
  on billing_processor_events (received_at desc)
  where signature_verified = false;

-- Rolling counters behind the real-time transaction monitoring Visa requires of
-- MCC 7273 merchants under the Integrity Risk Program. One row per user per
-- window; nothing here grants or revokes access on its own.
create table if not exists payment_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  sale_id text,
  event_type text not null,
  outcome text not null,
  ip_hash text,
  country text,
  amount_cents integer,
  created_at timestamptz not null default now(),
  constraint payment_monitoring_events_outcome_check
    check (outcome in ('approved', 'declined', 'chargeback', 'refund'))
);

create index if not exists payment_monitoring_events_user_created_idx
  on payment_monitoring_events (user_id, created_at desc);

create index if not exists payment_monitoring_events_outcome_created_idx
  on payment_monitoring_events (outcome, created_at desc);

create index if not exists payment_monitoring_events_ip_created_idx
  on payment_monitoring_events (ip_hash, created_at desc)
  where ip_hash is not null;
