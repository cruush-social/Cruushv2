-- The composer offers a 3 hour expiry now, so the column has to accept it.
--
-- Replay-safe: the v2 constraint name is the sentinel. Once it exists this
-- migration does nothing, so a boot never drops and revalidates repeatedly.
do $$
begin
  if exists (
    select from pg_constraint
    where conname = 'posts_expires_in_check_v2'
  ) then
    return;
  end if;

  alter table posts drop constraint if exists posts_expires_in_check;
  alter table posts add constraint posts_expires_in_check_v2
    check (expires_in in ('1h', '3h', '6h', '24h', '7d', 'never'));
end $$;
