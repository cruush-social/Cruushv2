alter table clubs
  add column if not exists conversation_id uuid unique references conversations(id) on delete set null;
