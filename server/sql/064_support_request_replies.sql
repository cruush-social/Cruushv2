create table if not exists support_request_replies (
  id uuid primary key default gen_random_uuid(),
  support_request_id uuid not null references support_requests(id) on delete cascade,
  sender_user_id uuid references app_users(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  message text not null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_request_replies_request_created_at
  on support_request_replies (support_request_id, created_at desc);
