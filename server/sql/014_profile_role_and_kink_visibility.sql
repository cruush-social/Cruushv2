alter table profiles add column if not exists role text[] not null default '{}';
alter table profiles add column if not exists kinks_visibility text not null default 'public';

alter table profiles
  drop constraint if exists profiles_kinks_visibility_check;

alter table profiles
  add constraint profiles_kinks_visibility_check
  check (kinks_visibility in ('public', 'mutual_cruushes', 'mutual_crowds'));

update profiles
set role = (
  select coalesce(array_agg(value), '{}')
  from unnest(position) as value
  where lower(value) in ('dominant', 'submissive', 'switch', 'service')
)
where role = '{}'
  and exists (
    select 1
    from unnest(position) as value
    where lower(value) in ('dominant', 'submissive', 'switch', 'service')
  );

update profiles
set position = (
  select coalesce(array_agg(value), '{}')
  from unnest(position) as value
  where lower(value) not in ('dominant', 'submissive', 'switch', 'service', 'gooner')
)
where exists (
  select 1
  from unnest(position) as value
  where lower(value) in ('dominant', 'submissive', 'switch', 'service', 'gooner')
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'profile_kink_interests'
      and column_name = 'visibility'
  ) then
    execute $visibility_migration$
      update profiles p
      set kinks_visibility = coalesce((
        select case
          when bool_or(pki.visibility in ('mutual_crowds', 'crowd_t4t', 'crowd_sapphic', 'crowd_gay')) then 'mutual_crowds'
          when bool_or(pki.visibility in ('mutual_cruushes', 'private')) then 'mutual_cruushes'
          else 'public'
        end
        from profile_kink_interests pki
        where pki.user_id = p.id
      ), 'public')
      where exists (
        select 1
        from profile_kink_interests pki
        where pki.user_id = p.id
      )
    $visibility_migration$;
  end if;
end $$;

drop index if exists profile_kink_interests_public_seeking_idx;
drop index if exists profile_kink_interests_roles_idx;

alter table profile_kink_interests
  drop constraint if exists profile_kink_interests_roles_check;

alter table profile_kink_interests
  drop constraint if exists profile_kink_interests_visibility_check;

alter table profile_kink_interests
  drop column if exists interest_level,
  drop column if exists roles,
  drop column if exists is_seeking,
  drop column if exists visibility;
