create table if not exists place_detail_suggestions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  supporter_token text not null,
  suggestion_ciphertext text not null,
  suggestion_nonce text not null,
  suggestion_auth_tag text not null,
  suggestion_key_version text not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, supporter_token)
);

create index if not exists idx_place_detail_suggestions_review
  on place_detail_suggestions (status, updated_at desc);
