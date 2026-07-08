create table if not exists csam_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  user_email text,
  user_display_name text,
  surface text not null check (surface in ('profile_photo', 'direct_message', 'group_message')),
  content_type text not null default 'image' check (content_type in ('image')),
  status text not null default 'awaiting_submission' check (status in ('open', 'awaiting_submission', 'submitted', 'closed')),
  reporting_mode text not null default 'manual_packet' check (reporting_mode in ('manual_packet', 'ncmec_direct')),
  test_mode boolean not null default false,
  environment text not null,
  provider text not null default 'photodna',
  provider_request_id text,
  photodna_result jsonb not null default '{}',
  alert_status text not null default 'not_sent' check (alert_status in ('not_sent', 'sent', 'failed')),
  alert_error text,
  cybertipline_report_id text,
  ncmec_reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_csam_incidents_status_created
  on csam_incidents (status, created_at desc);

create index if not exists idx_csam_incidents_user_created
  on csam_incidents (user_id, created_at desc)
  where user_id is not null;

create table if not exists csam_incident_evidence (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references csam_incidents(id) on delete cascade,
  object_key text not null unique,
  sha256_hex text not null,
  original_filename text,
  mime_type text not null,
  byte_size integer not null,
  encrypted_data_key text not null,
  data_key_nonce text not null,
  data_key_auth_tag text not null,
  content_nonce text not null,
  content_auth_tag text not null,
  key_version text not null,
  source_route text not null,
  request_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_csam_evidence_incident
  on csam_incident_evidence (incident_id, created_at desc);

create table if not exists csam_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references csam_incidents(id) on delete cascade,
  event_type text not null check (event_type in (
    'match_detected',
    'evidence_preserved',
    'content_review_recorded',
    'account_locked',
    'alert_sent',
    'alert_failed',
    'report_packet_generated',
    'ncmec_submitted'
  )),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_csam_events_incident
  on csam_incident_events (incident_id, created_at desc);
