create table if not exists billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  plan_id text not null,
  processor text not null default 'fake',
  status text not null default 'pending',
  test_mode boolean not null default true,
  amount_cents integer not null,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz,
  constraint billing_checkout_sessions_processor_check
    check (processor in ('fake')),
  constraint billing_checkout_sessions_status_check
    check (status in ('pending', 'completed', 'cancelled', 'failed')),
  constraint billing_checkout_sessions_amount_check
    check (amount_cents > 0),
  constraint billing_checkout_sessions_currency_check
    check (currency = 'USD')
);

create index if not exists billing_checkout_sessions_user_created_at_idx
  on billing_checkout_sessions (user_id, created_at desc);

create index if not exists billing_checkout_sessions_status_expires_idx
  on billing_checkout_sessions (status, expires_at);

alter table if exists user_entitlements
  drop constraint if exists user_entitlements_user_id_fkey;

alter table if exists user_entitlements
  add constraint user_entitlements_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;

create table if not exists cruush_plus_subscriptions (
  user_id uuid primary key references app_users(id) on delete cascade,
  checkout_session_id uuid references billing_checkout_sessions(id) on delete set null,
  plan_id text not null,
  status text not null default 'active',
  current_period_starts_at timestamptz not null default now(),
  current_period_ends_at timestamptz not null,
  test_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cruush_plus_subscriptions_status_check
    check (status in ('active', 'cancelled', 'expired', 'past_due'))
);

create index if not exists cruush_plus_subscriptions_period_idx
  on cruush_plus_subscriptions (current_period_ends_at)
  where status = 'active';

create table if not exists cruush_plus_lifetime_access (
  user_id uuid primary key references app_users(id) on delete cascade,
  checkout_session_id uuid references billing_checkout_sessions(id) on delete set null,
  plan_id text not null,
  test_mode boolean not null default true,
  granted_at timestamptz not null default now()
);

create table if not exists founder_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  checkout_session_id uuid references billing_checkout_sessions(id) on delete set null,
  plan_id text not null,
  amount_cents integer not null,
  test_mode boolean not null default true,
  redeemed_at timestamptz not null default now(),
  unique (user_id, plan_id)
);

create index if not exists founder_redemptions_real_supply_idx
  on founder_redemptions (plan_id, redeemed_at)
  where test_mode = false;

create table if not exists user_badges (
  user_id uuid not null references app_users(id) on delete cascade,
  badge_key text not null,
  source_plan_id text,
  permanent boolean not null default true,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_key),
  constraint user_badges_badge_key_check
    check (badge_key in ('founder', 'lifetime_founder'))
);

create index if not exists user_badges_user_awarded_at_idx
  on user_badges (user_id, awarded_at);

alter table if exists cruush_plus_subscriptions
  drop constraint if exists cruush_plus_subscriptions_user_id_fkey;

alter table if exists cruush_plus_subscriptions
  add constraint cruush_plus_subscriptions_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;

alter table if exists cruush_plus_lifetime_access
  drop constraint if exists cruush_plus_lifetime_access_user_id_fkey;

alter table if exists cruush_plus_lifetime_access
  add constraint cruush_plus_lifetime_access_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;

alter table if exists founder_redemptions
  drop constraint if exists founder_redemptions_user_id_fkey;

alter table if exists founder_redemptions
  add constraint founder_redemptions_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;

alter table if exists user_badges
  drop constraint if exists user_badges_user_id_fkey;

alter table if exists user_badges
  add constraint user_badges_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;
