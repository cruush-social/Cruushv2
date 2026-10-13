-- One owner warning per low-gas episode, durable across restarts/replicas.
create table if not exists crypto_gas_alerts (
  wallet_fingerprint text not null,
  chain_id integer not null check (chain_id in (1, 8453, 42161)),
  balance_wei numeric(78, 0) not null check (balance_wei >= 0),
  episode_id uuid,
  email_snapshot jsonb,
  first_attempt_at timestamptz,
  email_sent_at timestamptz,
  provider_message_id text,
  claim_token uuid,
  claimed_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (wallet_fingerprint, chain_id)
);

-- Keep replay safe for an existing preview database created before snapshots.
alter table crypto_gas_alerts add column if not exists email_snapshot jsonb;
