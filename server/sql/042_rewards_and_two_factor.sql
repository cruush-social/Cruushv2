alter table app_users
  add column if not exists timezone text not null default 'UTC';

alter table trust_events
  add column if not exists idempotency_key text;

create unique index if not exists trust_events_idempotency_key_uidx
  on trust_events (idempotency_key)
  where idempotency_key is not null;

alter table app_notifications
  drop constraint if exists app_notifications_type_check;

alter table app_notifications
  add constraint app_notifications_type_check
  check (type in (
    'incoming_cruush',
    'mutual_cruush',
    'direct_message',
    'group_message',
    'group_membership',
    'nearby_activity',
    'reward',
    'announcement'
  )) not valid;

create table if not exists reward_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into reward_settings (key, value)
values
  ('recurring_streak_days', '7'::jsonb),
  ('recurring_streak_reward_days', '1'::jsonb),
  ('long_streak_days', '1'::jsonb),
  ('long_streak_bonus_days', '1'::jsonb),
  ('activity_reward_cap_days', '5'::jsonb),
  ('activity_reward_cap_period_days', '30'::jsonb),
  ('referral_min_account_age_days', '7'::jsonb),
  ('referral_reward_days', '7'::jsonb),
  ('max_banked_promotional_days', '90'::jsonb),
  ('referral_reward_cap_days', 'null'::jsonb),
  ('two_factor_trust_points', '10'::jsonb),
  ('referral_trust_points', '1'::jsonb),
  ('max_referral_trust_points', '20'::jsonb),
  ('eligible_activity_types', '["check_in"]'::jsonb),
  ('profile_completion_fields', '["display_name","year_of_birth","bio","pronouns","identities","looking_for","vibes"]'::jsonb)
on conflict (key) do nothing;

create table if not exists referral_identities (
  user_id uuid primary key references app_users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint referral_identities_code_check
    check (code ~ '^[A-Za-z0-9_-]{16,64}$')
);

insert into referral_identities (user_id, code)
select id, encode(gen_random_bytes(16), 'hex')
from app_users
on conflict (user_id) do nothing;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references app_users(id) on delete cascade,
  referred_user_id uuid not null references app_users(id) on delete cascade,
  referral_code text not null references referral_identities(code),
  status text not null default 'pending',
  rejection_reason text,
  risk_score integer not null default 0,
  review_flags jsonb not null default '[]'::jsonb,
  signup_ip_hash text,
  signup_device_hash text,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_status_check
    check (status in ('pending', 'qualified', 'rewarded', 'rejected', 'flagged', 'reversed')),
  constraint referrals_no_self_check
    check (referrer_user_id <> referred_user_id),
  constraint referrals_one_referrer_per_account unique (referred_user_id)
);

create index if not exists referrals_qualification_queue_idx
  on referrals (status, created_at)
  where status = 'pending';

create index if not exists referrals_referrer_status_idx
  on referrals (referrer_user_id, status, created_at desc);

create index if not exists referrals_ip_signal_idx
  on referrals (signup_ip_hash, created_at desc)
  where signup_ip_hash is not null;

create or replace function prevent_referral_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.referrer_user_id <> old.referrer_user_id
     or new.referred_user_id <> old.referred_user_id
     or new.referral_code <> old.referral_code then
    raise exception 'referral association is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists referrals_prevent_reassignment on referrals;
create trigger referrals_prevent_reassignment
before update on referrals
for each row execute function prevent_referral_reassignment();

create table if not exists daily_activity_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  activity_date date not null,
  timezone text not null,
  activity_type text not null,
  source_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint daily_activity_credits_one_per_day unique (user_id, activity_date)
);

create index if not exists daily_activity_credits_user_created_idx
  on daily_activity_credits (user_id, activity_date desc);

create table if not exists user_activity_streaks (
  user_id uuid primary key references app_users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_date date,
  updated_at timestamptz not null default now()
);

create table if not exists promotional_cruush_plus_entitlements (
  user_id uuid primary key references app_users(id) on delete cascade,
  active_until timestamptz,
  banked_seconds bigint not null default 0 check (banked_seconds >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  days integer not null check (days > 0),
  idempotency_key text not null unique,
  milestone_key text,
  referral_id uuid,
  status text not null default 'active',
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reward_grants_source_check
    check (source in ('activity_recurring', 'activity_long_bonus', 'referral', 'admin')),
  constraint reward_grants_status_check
    check (status = 'active')
);

create unique index if not exists reward_grants_milestone_uidx
  on reward_grants (user_id, source, milestone_key)
  where milestone_key is not null;

create unique index if not exists reward_grants_referral_uidx
  on reward_grants (referral_id)
  where referral_id is not null;

create index if not exists reward_grants_user_created_idx
  on reward_grants (user_id, created_at desc);

create table if not exists reward_grant_reversals (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null unique references reward_grants(id) on delete restrict,
  user_id uuid not null,
  days integer not null check (days > 0),
  reason text not null,
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function prevent_reward_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'reward grant ledger is append-only';
end;
$$;

drop trigger if exists reward_grants_append_only_update on reward_grants;
create trigger reward_grants_append_only_update
before update or delete on reward_grants
for each row execute function prevent_reward_ledger_mutation();

drop trigger if exists reward_reversals_append_only_update on reward_grant_reversals;
create trigger reward_reversals_append_only_update
before update or delete on reward_grant_reversals
for each row execute function prevent_reward_ledger_mutation();

create table if not exists user_two_factor_auth (
  user_id uuid primary key references app_users(id) on delete cascade,
  secret_ciphertext text not null,
  secret_nonce text not null,
  secret_auth_tag text not null,
  secret_key_version text not null default 'v1',
  enabled_at timestamptz,
  setup_created_at timestamptz not null default now(),
  trust_awarded_at timestamptz,
  last_used_time_step bigint,
  updated_at timestamptz not null default now()
);

create table if not exists user_two_factor_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_two_factor_recovery_unused_idx
  on user_two_factor_recovery_codes (user_id, used_at)
  where used_at is null;
