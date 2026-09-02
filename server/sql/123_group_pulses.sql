-- Group Pulses consume the initiating owner's or admin's personal allowance.
-- Delivery rows share the existing Pulse history so every recipient preference
-- and repeat limit applies across individual and group Pulses.
create table if not exists group_pulses (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_user_id uuid not null references app_users(id) on delete cascade,
  idempotency_key uuid not null,
  bonus_credit_used boolean not null default false,
  created_at timestamptz not null default now(),
  constraint group_pulses_sender_idempotency_unique unique (sender_user_id, idempotency_key)
);

create index if not exists group_pulses_sender_created_idx
  on group_pulses (sender_user_id, created_at desc);

alter table map_ping_notifications
  alter column ping_id drop not null,
  add column if not exists group_pulse_id uuid references group_pulses(id) on delete cascade;

alter table map_ping_notifications
  drop constraint if exists map_ping_notifications_one_source_check;

alter table map_ping_notifications
  add constraint map_ping_notifications_one_source_check
  check (num_nonnulls(ping_id, group_pulse_id) = 1);

create unique index if not exists map_ping_notifications_group_recipient_idx
  on map_ping_notifications (group_pulse_id, recipient_user_id)
  where group_pulse_id is not null;
