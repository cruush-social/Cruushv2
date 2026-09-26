alter table support_requests
  drop constraint if exists support_requests_category_check;

alter table support_requests
  add constraint support_requests_category_check
  check (category in (
    'bug', 'comment', 'question', 'policy', 'suspension_appeal',
    'billing_payment', 'billing_subscription', 'billing_pulse', 'billing_refund'
  ));
