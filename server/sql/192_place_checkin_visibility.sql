alter table place_checkins
  add column if not exists visibility_scope text;

update place_checkins
set visibility_scope = case when visible then 'public' else 'hidden' end
where visibility_scope is null;

alter table place_checkins
  alter column visibility_scope set default 'hidden',
  alter column visibility_scope set not null;

alter table place_checkins
  drop constraint if exists place_checkins_visibility_scope_check;

alter table place_checkins
  add constraint place_checkins_visibility_scope_check
  check (visibility_scope in ('hidden', 'public', 'checked_in'));
