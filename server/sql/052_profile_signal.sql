alter table profiles
  add column if not exists signal text not null default '';

alter table profiles
  drop constraint if exists profiles_signal_length_check;

alter table profiles
  add constraint profiles_signal_length_check check (char_length(signal) <= 180);
