create table if not exists oos_welcome_emails (
  user_id uuid primary key references app_users(id) on delete cascade,
  queued_at timestamptz not null default now(),
  claim_token uuid,
  claimed_until timestamptz,
  email_started_at timestamptz,
  email_to text,
  email_sent_at timestamptz,
  provider_message_id text,
  reconciliation_required_at timestamptz
);

create index if not exists oos_welcome_emails_pending_idx
  on oos_welcome_emails (queued_at)
  where email_sent_at is null and reconciliation_required_at is null;

-- Expand the unshipped one-row-per-user queue on replay, preserving history
-- and the original provider keys for any ambiguous delivery attempts.
alter table oos_welcome_emails add column if not exists event_id uuid not null default gen_random_uuid();
alter table oos_welcome_emails add column if not exists idempotency_key text;
alter table oos_welcome_emails add column if not exists cancelled_at timestamptz;
update oos_welcome_emails set idempotency_key = 'oos-welcome/' || user_id::text
where idempotency_key is null;
alter table oos_welcome_emails alter column idempotency_key set not null;
alter table oos_welcome_emails drop constraint if exists oos_welcome_emails_pkey;
alter table oos_welcome_emails add constraint oos_welcome_emails_pkey primary key (event_id);
create unique index if not exists oos_welcome_emails_idempotency_idx on oos_welcome_emails (idempotency_key);

create table if not exists oos_service_area_state (
  user_id uuid primary key references app_users(id) on delete cascade,
  is_outside boolean not null,
  current_event_id uuid,
  updated_at timestamptz not null default now(),
  check (is_outside = (current_event_id is not null))
);

-- Existing queue rows describe the last observed outside entry. This does
-- not enroll historical members. Delivery verifies decrypted physical GPS.
do $migration$
begin
  -- 218 contracts these legacy columns. Replaying 215 after 218 must not
  -- recreate plaintext or try to read columns that no longer exist.
  if exists (select 1 from information_schema.columns
             where table_schema = current_schema()
               and table_name = 'oos_service_area_state' and column_name = 'is_outside') then
    execute $backfill$
      insert into oos_service_area_state (user_id, is_outside, current_event_id)
      select distinct on (user_id) user_id, cancelled_at is null,
        case when cancelled_at is null then event_id else null end
      from oos_welcome_emails
      order by user_id, queued_at desc, event_id
      on conflict (user_id) do nothing
    $backfill$;
  end if;
end
$migration$;

drop index if exists oos_welcome_emails_pending_idx;
create index oos_welcome_emails_pending_idx on oos_welcome_emails (queued_at)
where email_sent_at is null and reconciliation_required_at is null and cancelled_at is null;
