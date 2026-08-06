do $$
begin
  alter table posts
    drop constraint if exists posts_expires_in_check;

  alter table posts
    add constraint posts_expires_in_check
    check (expires_in in ('1h', '6h', '24h', '7d', 'never'));
end $$;
