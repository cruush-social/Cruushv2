-- Distinguish cruush+ purchases from permanent Ping-credit packs while keeping
-- every attempt in the existing crypto payment ledger.
alter table crypto_payment_intents
  add column if not exists product_type text not null default 'cruush_plus';

alter table crypto_payment_intents
  drop constraint if exists crypto_payment_intents_product_type_check;

alter table crypto_payment_intents
  add constraint crypto_payment_intents_product_type_check
  check (product_type in ('cruush_plus', 'ping_pack'));

create index if not exists crypto_payment_intents_user_product_created_idx
  on crypto_payment_intents (user_id, product_type, created_at desc);

-- One row is one fulfilled pack. The unique intent key makes settlement
-- idempotent even if multiple watcher processes observe the same transfer.
create table if not exists ping_pack_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  crypto_payment_intent_id uuid not null unique
    references crypto_payment_intents(id) on delete cascade,
  pack_id text not null,
  ping_count integer not null check (ping_count > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  granted_at timestamptz not null default now(),
  constraint ping_pack_purchases_catalog_check check (
    (pack_id = 'ping_3' and ping_count = 3 and amount_cents = 299)
    or (pack_id = 'ping_10' and ping_count = 10 and amount_cents = 799)
    or (pack_id = 'ping_25' and ping_count = 25 and amount_cents = 1499)
  )
);

create index if not exists ping_pack_purchases_user_granted_idx
  on ping_pack_purchases (user_id, granted_at desc);

comment on table ping_pack_purchases is
  'Permanent Ping-credit grants fulfilled from confirmed crypto payment intents.';

comment on column ping_pack_purchases.ping_count is
  'Credits never expire. One consumed credit activates one 30-minute Pulse.';
