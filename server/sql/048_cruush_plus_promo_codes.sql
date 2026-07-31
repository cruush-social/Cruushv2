create table if not exists cruush_plus_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null default 'cruush+ promo',
  grant_days integer check (grant_days is null or grant_days > 0),
  active_until timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cruush_plus_promo_codes_grant_check
    check (grant_days is not null or active_until is not null)
);

create unique index if not exists cruush_plus_promo_codes_upper_code_uidx
  on cruush_plus_promo_codes (upper(code));

create table if not exists cruush_plus_promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references cruush_plus_promo_codes(id) on delete restrict,
  user_id uuid not null references app_users(id) on delete cascade,
  grant_id uuid references reward_grants(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  unique (promo_code_id, user_id)
);

create index if not exists cruush_plus_promo_code_redemptions_user_idx
  on cruush_plus_promo_code_redemptions (user_id, redeemed_at desc);
