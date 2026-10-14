-- Keep reward accounting facts while removing the deleted member's identity.
-- Ordinary ledger updates/deletes remain forbidden. The only permitted update
-- is this exact redaction, from account deletion or for an already absent owner.
alter table reward_grants alter column user_id drop not null;
alter table reward_grant_reversals alter column user_id drop not null;

create or replace function redact_absent_reward_account_references(metadata jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  redacted jsonb := metadata;
  reference_key text;
  reference_id text;
begin
  foreach reference_key in array array['referredUserId', 'referrerUserId', 'actorUserId', 'userId'] loop
    reference_id := metadata->>reference_key;
    if reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (select 1 from app_users where id::text = reference_id) then
      redacted := redacted - reference_key;
    end if;
  end loop;
  return redacted;
end;
$$;

create or replace function prevent_reward_ledger_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- A referrer's grant or an administrator's reversal may mention a different
  -- deleted member. Permit only removal of recognized absent-account links;
  -- preserve the active ledger owner and every other field/metadata value.
  if tg_op = 'UPDATE'
     and new.audit_metadata is distinct from old.audit_metadata
     and new.audit_metadata = redact_absent_reward_account_references(old.audit_metadata)
     and (to_jsonb(new) - 'audit_metadata') = (to_jsonb(old) - 'audit_metadata') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.user_id is not null and new.user_id is null
     and new.audit_metadata = '{}'::jsonb
     and (
       pg_trigger_depth() > 1 or
       not exists (select 1 from app_users where id = old.user_id)
     ) then
    if tg_table_name = 'reward_grants' then
      if new.idempotency_key = 'account-deleted:' || old.id::text
         and new.milestone_key is null and new.referral_id is null
         and (to_jsonb(new) - array['user_id', 'audit_metadata', 'idempotency_key', 'milestone_key', 'referral_id'])
             = (to_jsonb(old) - array['user_id', 'audit_metadata', 'idempotency_key', 'milestone_key', 'referral_id']) then
        return new;
      end if;
    elsif tg_table_name = 'reward_grant_reversals' then
      if new.reason = 'Account deleted'
         and (to_jsonb(new) - array['user_id', 'audit_metadata', 'reason'])
             = (to_jsonb(old) - array['user_id', 'audit_metadata', 'reason']) then
        return new;
      end if;
    end if;
  end if;
  raise exception 'reward grant ledger is append-only';
end;
$$;

-- Repair ledger links left by accounts deleted before this migration. Do not
-- change any active member's ledger or the quantities, dates, and reversal links.
update reward_grants reward
set user_id = null, audit_metadata = '{}'::jsonb,
    idempotency_key = 'account-deleted:' || reward.id::text,
    milestone_key = null, referral_id = null
where reward.user_id is not null
  and not exists (select 1 from app_users account where account.id = reward.user_id);

update reward_grant_reversals reversal
set user_id = null, audit_metadata = '{}'::jsonb, reason = 'Account deleted'
where reversal.user_id is not null
  and not exists (select 1 from app_users account where account.id = reversal.user_id);

update reward_grants
set audit_metadata = redact_absent_reward_account_references(audit_metadata)
where audit_metadata is distinct from redact_absent_reward_account_references(audit_metadata);

update reward_grant_reversals
set audit_metadata = redact_absent_reward_account_references(audit_metadata)
where audit_metadata is distinct from redact_absent_reward_account_references(audit_metadata);

create or replace function redact_deleted_account_reward_ledger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update reward_grants
  set user_id = null, audit_metadata = '{}'::jsonb,
      idempotency_key = 'account-deleted:' || id::text,
      milestone_key = null, referral_id = null
  where user_id = old.id;

  update reward_grant_reversals
  set user_id = null, audit_metadata = '{}'::jsonb, reason = 'Account deleted'
  where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists app_users_redact_reward_ledger on app_users;
create trigger app_users_redact_reward_ledger
before delete on app_users
for each row execute function redact_deleted_account_reward_ledger();

create or replace function redact_deleted_account_reward_references()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update reward_grants
  set audit_metadata = redact_absent_reward_account_references(audit_metadata)
  where audit_metadata->>'referredUserId' = old.id::text
     or audit_metadata->>'referrerUserId' = old.id::text
     or audit_metadata->>'actorUserId' = old.id::text
     or audit_metadata->>'userId' = old.id::text;

  update reward_grant_reversals
  set audit_metadata = redact_absent_reward_account_references(audit_metadata)
  where audit_metadata->>'referredUserId' = old.id::text
     or audit_metadata->>'referrerUserId' = old.id::text
     or audit_metadata->>'actorUserId' = old.id::text
     or audit_metadata->>'userId' = old.id::text;
  return old;
end;
$$;

drop trigger if exists app_users_redact_reward_references on app_users;
create trigger app_users_redact_reward_references
after delete on app_users
for each row execute function redact_deleted_account_reward_references();

-- A concurrent reward writer cannot recreate a link after account deletion.
-- Restrict is intentional: the deletion trigger performs the full redaction,
-- rather than permitting a partial SET NULL that leaves identifiers in metadata.
alter table reward_grants drop constraint if exists reward_grants_user_id_fkey;
alter table reward_grants add constraint reward_grants_user_id_fkey
  foreign key (user_id) references app_users(id) on delete restrict not valid;
alter table reward_grants validate constraint reward_grants_user_id_fkey;

alter table reward_grant_reversals drop constraint if exists reward_grant_reversals_user_id_fkey;
alter table reward_grant_reversals add constraint reward_grant_reversals_user_id_fkey
  foreign key (user_id) references app_users(id) on delete restrict not valid;
alter table reward_grant_reversals validate constraint reward_grant_reversals_user_id_fkey;
