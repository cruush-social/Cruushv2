alter table profiles
  add column if not exists side_badges jsonb not null
  default '{"left":null,"right":null}'::jsonb;
