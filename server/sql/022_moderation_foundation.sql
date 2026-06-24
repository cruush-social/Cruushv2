create table if not exists user_trust_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  trust_score integer not null default 50 check (trust_score between 0 and 100),
  trust_level text not null default 'established' check (trust_level in ('restricted', 'new', 'established', 'trusted', 'verified_trusted')),
  report_weight numeric(5,2) not null default 50,
  max_future_trust integer check (max_future_trust between 0 and 100),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into user_trust_profiles (user_id)
select id
from app_users
on conflict (user_id) do nothing;

create table if not exists trust_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  event_type text not null,
  value integer not null,
  decays boolean not null default true,
  permanent boolean not null default false,
  source text not null check (source in ('ai', 'system', 'future_human_moderator')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_trust_events_user_created
  on trust_events (user_id, created_at desc);

create table if not exists content_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  surface text not null check (surface in ('feed', 'direct_message', 'group_message', 'profile', 'profile_photo', 'private_photo')),
  content_type text not null check (content_type in ('text', 'image')),
  status text not null check (status in (
    'pending',
    'provider_processing',
    'allowed',
    'encrypted',
    'stored',
    'delivered',
    'published',
    'rejected',
    'enforcement_applied',
    'closed',
    'provider_timeout',
    'queued_retry',
    'queued',
    'failed_provider_unavailable',
    'encryption_failed'
  )),
  provider text,
  provider_request_id text,
  provider_result_encrypted bytea,
  normalized_labels jsonb not null default '[]',
  policy_decision jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_content_reviews_user_status
  on content_reviews (user_id, status, created_at desc);

create index if not exists idx_content_reviews_surface_created
  on content_reviews (surface, created_at desc);

create table if not exists moderation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  content_review_id uuid references content_reviews(id) on delete set null,
  category text not null,
  action text not null,
  trust_impact integer not null default 0,
  trust_cap_applied integer,
  source text not null check (source in ('ai', 'system', 'future_human_moderator')),
  reason_code text not null,
  notes_encrypted bytea,
  created_at timestamptz not null default now()
);

create index if not exists idx_mod_history_user_created
  on moderation_history (user_id, created_at desc);

create table if not exists evidence_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references app_users(id) on delete cascade,
  source_type text not null check (source_type in ('report', 'behavior', 'ai', 'block', 'system', 'future_human_moderator')),
  category text not null,
  evidence_value numeric(8,2) not null,
  confidence numeric(4,3),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_evidence_active
  on evidence_events (target_user_id, expires_at, category);

create table if not exists suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  reason_code text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  permanent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_suspensions_user_active
  on suspensions (user_id, permanent, ends_at, starts_at desc);

create table if not exists feature_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  feature text not null check (feature in (
    'feed_posting',
    'direct_messages',
    'group_messages',
    'group_creation',
    'photo_uploads',
    'map_visibility',
    'crowd_visibility'
  )),
  scope text not null default 'global',
  reason_code text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_feature_restrictions_user_feature
  on feature_restrictions (user_id, feature, scope, starts_at desc);

alter table reports
  add column if not exists report_weight numeric(6,2) not null default 50;

alter table reports
  add column if not exists evidence_event_id uuid references evidence_events(id) on delete set null;
