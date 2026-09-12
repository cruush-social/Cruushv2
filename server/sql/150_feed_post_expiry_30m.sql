-- The composer's expiry slider starts at 30 minutes now, so the column has to
-- accept it.
--
-- Replay-safe: the v3 constraint name is the sentinel. Once it exists this
-- migration does nothing.
do $$
begin
  if exists (select from pg_constraint where conname = 'posts_expires_in_check_v3') then
    return;
  end if;

  alter table posts drop constraint if exists posts_expires_in_check;
  alter table posts drop constraint if exists posts_expires_in_check_v2;
  alter table posts add constraint posts_expires_in_check_v3
    check (expires_in in ('30m', '1h', '3h', '6h', '24h', '7d', 'never'));
end $$;
