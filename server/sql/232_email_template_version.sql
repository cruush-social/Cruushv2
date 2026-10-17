-- A started report without a version may have been accepted under the prior template.
-- Keep that delivery for reconciliation rather than changing bytes under its key.
alter table weekly_order_reports add column if not exists email_template_version text;
