alter table reports
  drop constraint if exists reports_reason_check;

alter table reports
  add constraint reports_reason_check
  check (reason in (
    'non_consensual_imagery',
    'minor_safety',
    'impersonation',
    'coercion_trafficking',
    'illegal_activity',
    'spam_scam',
    'harassment',
    'fetishization',
    'hate',
    'violence_threat',
    'privacy_location',
    'location_spoofing',
    'other'
  ));
