create table if not exists billing_coupon_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_off integer not null,
  new_member_only boolean not null default true,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_coupon_codes_percent_check check (percent_off > 0 and percent_off < 100)
);

create unique index if not exists billing_coupon_codes_upper_code_uidx
  on billing_coupon_codes (upper(code));

create table if not exists billing_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references billing_coupon_codes(id) on delete restrict,
  user_id uuid not null references app_users(id) on delete cascade,
  checkout_session_id uuid not null references billing_checkout_sessions(id) on delete restrict,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, user_id)
);

create index if not exists billing_coupon_redemptions_user_idx
  on billing_coupon_redemptions (user_id, redeemed_at desc);

insert into billing_coupon_codes (code, percent_off, new_member_only, active)
values
  ('NEW50', 50, true, true),
  ('REDDIT50', 50, true, true)
on conflict (code) do update
set percent_off = excluded.percent_off,
    new_member_only = excluded.new_member_only,
    active = excluded.active,
    updated_at = now();

alter table if exists billing_checkout_sessions
  add column if not exists original_amount_cents integer,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists coupon_code text;

update billing_checkout_sessions
set original_amount_cents = amount_cents
where original_amount_cents is null;

alter table if exists billing_checkout_sessions
  alter column original_amount_cents set not null;
