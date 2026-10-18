-- Only future activation transitions enqueue mail. No historical backfill.
create table if not exists order_payment_confirmation_emails (
  intent_id uuid primary key references crypto_payment_intents(id) on delete cascade,
  access_expires_at timestamptz,
  claimed_until timestamptz not null default now(),
  claim_token uuid,
  first_attempt_at timestamptz,
  delivery_hash text,
  sent_at timestamptz,
  provider_message_id text,
  reconciliation_required boolean not null default false
);
create index if not exists order_payment_confirmation_emails_pending_idx
  on order_payment_confirmation_emails(claimed_until) where sent_at is null and not reconciliation_required;

create or replace function enqueue_order_payment_confirmation_email() returns trigger language plpgsql as $$
declare access_end timestamptz;
begin
  if new.status = 'paid' and new.entitlement_granted_at is not null
     and old.entitlement_granted_at is null then
    if new.product_type = 'cruush_plus' then
      select current_period_ends_at into access_end from cruush_plus_subscriptions
        where user_id = new.user_id and crypto_payment_intent_id = new.id;
      -- An absent subscription is only valid for an actual lifetime grant.
      if access_end is null and not exists (
        select 1 from cruush_plus_lifetime_access
        where user_id = new.user_id and crypto_payment_intent_id = new.id
      ) then
        return new;
      end if;
    end if;
    insert into order_payment_confirmation_emails(intent_id, access_expires_at)
      values(new.id, access_end) on conflict(intent_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists order_payment_confirmation_email on crypto_payment_intents;
create trigger order_payment_confirmation_email after update of entitlement_granted_at on crypto_payment_intents
  for each row execute function enqueue_order_payment_confirmation_email();
