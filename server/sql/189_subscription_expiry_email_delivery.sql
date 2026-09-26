alter table subscription_expiry_reminders
  add column if not exists email_payload jsonb,
  add column if not exists email_idempotency_key text,
  add column if not exists email_provider_message_id text,
  add column if not exists email_delivery_state text not null default 'pending',
  add column if not exists email_reconciliation_required_at timestamptz;

update subscription_expiry_reminders
set email_delivery_state = 'provider_accepted'
where email_sent_at is not null
  and email_delivery_state = 'pending';

alter table subscription_expiry_reminders
  drop constraint if exists subscription_expiry_email_delivery_state_check;

alter table subscription_expiry_reminders
  add constraint subscription_expiry_email_delivery_state_check
  check (email_delivery_state in ('pending', 'provider_accepted', 'reconciliation_required'));

create unique index if not exists subscription_expiry_email_idempotency_key_unique
  on subscription_expiry_reminders(email_idempotency_key)
  where email_idempotency_key is not null;

create unique index if not exists subscription_expiry_email_provider_message_id_unique
  on subscription_expiry_reminders(email_provider_message_id)
  where email_provider_message_id is not null;
