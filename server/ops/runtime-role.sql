-- Operator-only preparation. Never register this file as a startup migration.
-- Required psql inputs: expected_database, runtime_role, migration_owner.
-- Connect with an independently secured administrator credential. Do not pass
-- passwords in psql variables, command arguments, this file, or captured output.
-- A new role is NOLOGIN with no password. Authentication activation is separate.
-- Existing ownership, PUBLIC privileges and existing login settings are preserved.
-- Future defaults apply to the named owner's public-schema objects. PostgreSQL
-- cannot exclude future extension members from defaults: install/review future
-- extensions separately before permitting runtime access to their relations.
\set ON_ERROR_STOP on
\if :{?expected_database}
\else
  \set expected_database ''
\endif
\if :{?runtime_role}
\else
  \set runtime_role ''
\endif
\if :{?migration_owner}
\else
  \set migration_owner ''
\endif

begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select set_config('cruush.role_expected_database', :'expected_database', true) as expected_database,
       set_config('cruush.role_runtime', :'runtime_role', true) as runtime_role,
       set_config('cruush.role_migration_owner', :'migration_owner', true) as migration_owner
\gset

do $prepare_runtime_role$
declare
  expected_database text := current_setting('cruush.role_expected_database');
  runtime_name text := current_setting('cruush.role_runtime');
  owner_name text := current_setting('cruush.role_migration_owner');
  runtime_oid oid;
  owner_oid oid;
  public_oid oid;
  relation record;
begin
  if expected_database = '' or current_database() <> expected_database then
    raise exception 'Runtime role preparation requires the exact expected database.';
  end if;
  if runtime_name !~ '^[a-z][a-z0-9_]{0,62}$'
     or owner_name !~ '^[a-z][a-z0-9_]{0,62}$'
     or runtime_name like 'pg\_%' escape '\'
     or runtime_name = owner_name or runtime_name = current_user then
    raise exception 'Runtime and migration roles must be distinct valid identifiers.';
  end if;
  select oid into owner_oid from pg_roles where rolname = owner_name;
  select oid into public_oid from pg_namespace where nspname = 'public';
  if owner_oid is null or public_oid is null then
    raise exception 'The migration owner and application schema must already exist.';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and rolsuper)
     and current_user <> owner_name then
    raise exception 'Use the schema owner or an authorized administrator for role preparation.';
  end if;

  select oid into runtime_oid from pg_roles where rolname = runtime_name;
  if runtime_oid is null then
    execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', runtime_name);
    select oid into runtime_oid from pg_roles where rolname = runtime_name;
  end if;

  if exists (select 1 from pg_roles where oid = runtime_oid
      and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls or rolinherit)) then
    raise exception 'Existing runtime role has unsafe attributes; no attributes were changed.';
  end if;
  -- NOINHERIT alone does not prevent SET ROLE. Reject memberships in either
  -- direction instead of silently revoking access from an existing consumer.
  if exists (select 1 from pg_auth_members where member = runtime_oid or roleid = runtime_oid) then
    raise exception 'Existing runtime role has memberships requiring separate review.';
  end if;
  -- Shared dependencies also cover ownership in databases other than this one.
  if exists (select 1 from pg_shdepend where refclassid = 'pg_authid'::regclass
      and refobjid = runtime_oid and deptype = 'o') then
    raise exception 'Runtime role owns database objects; ownership must remain separate.';
  end if;
  if has_database_privilege(runtime_oid, current_database(), 'CREATE')
     or exists (select 1 from pg_namespace where nspname !~ '^pg_temp_'
       and nspname !~ '^pg_toast_temp_' and has_schema_privilege(runtime_oid, oid, 'CREATE')) then
    raise exception 'Effective database/schema CREATE privilege requires separate review, including PUBLIC grants.';
  end if;
  if has_parameter_privilege(runtime_oid, 'session_replication_role', 'SET')
     or exists (select 1 from pg_parameter_acl p, aclexplode(p.paracl) a
       where a.grantee in (0, runtime_oid) and a.privilege_type = 'ALTER SYSTEM') then
    raise exception 'Runtime role has privileged server-parameter access.';
  end if;
  if current_setting('session_replication_role') <> 'origin'
     or exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) setting
       where s.setrole in (0, runtime_oid)
         and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
         and setting like 'session_replication_role=%'
         and setting <> 'session_replication_role=origin') then
    raise exception 'Runtime role has a trigger-bypassing startup setting.';
  end if;
  -- A direct routine grant can authorize a C builtin without SECURITY DEFINER
  -- or an administrative role membership. No direct routine grants are needed
  -- by this provisioning contract; unexpected ones require explicit review.
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where a.grantee = runtime_oid and a.privilege_type = 'EXECUTE')
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'pg_catalog'
         and p.proname in ('pg_read_file', 'pg_read_binary_file', 'pg_stat_file', 'pg_ls_dir',
           'lo_import', 'lo_export', 'pg_reload_conf', 'pg_rotate_logfile',
           'pg_create_restore_point', 'pg_switch_wal', 'pg_wal_replay_pause', 'pg_wal_replay_resume', 'pg_promote')
         and has_function_privilege(runtime_oid, p.oid, 'EXECUTE'))
     or has_any_column_privilege(runtime_oid, 'pg_catalog.pg_authid', 'SELECT')
     or has_any_column_privilege(runtime_oid, 'pg_catalog.pg_shadow', 'SELECT') then
    raise exception 'Runtime role has privileged routine or credential-catalog access.';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        and case when c.relkind in ('r','p','v','m','f') then
          (has_table_privilege(runtime_oid, c.oid, 'TRUNCATE,REFERENCES,TRIGGER')
            or has_table_privilege(runtime_oid, c.oid, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION'))
          else false end)
     or exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
         and case when c.relkind = 'S' then
           has_sequence_privilege(runtime_oid, c.oid, 'UPDATE,USAGE WITH GRANT OPTION,SELECT WITH GRANT OPTION')
           else false end) then
    raise exception 'Existing effective relation privileges exceed runtime requirements.';
  end if;
  if exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
      where d.defaclrole = owner_oid and d.defaclnamespace in (0, public_oid)
        and a.grantee in (0, runtime_oid)
        and (a.is_grantable
          or (d.defaclobjtype = 'r' and a.privilege_type not in ('SELECT','INSERT','UPDATE','DELETE'))
          or (d.defaclobjtype = 'S' and a.privilege_type <> 'USAGE'))) then
    raise exception 'Existing default privileges would grant excessive runtime access.';
  end if;

  execute format('grant connect on database %I to %I', expected_database, runtime_name);
  execute format('grant usage on schema public to %I', runtime_name);
  for relation in
    select c.relname, c.relkind from pg_class c
    where c.relnamespace = public_oid and c.relowner = owner_oid
      and c.relkind in ('r','p','S')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
        and d.objid = c.oid and d.deptype = 'e')
  loop
    if relation.relkind = 'S' then
      execute format('grant usage on sequence public.%I to %I', relation.relname, runtime_name);
    else
      execute format('grant select, insert, update, delete on table public.%I to %I', relation.relname, runtime_name);
    end if;
  end loop;
  execute format('alter default privileges for role %I in schema public grant select, insert, update, delete on tables to %I', owner_name, runtime_name);
  execute format('alter default privileges for role %I in schema public grant usage on sequences to %I', owner_name, runtime_name);

  -- Check after schema grants: an otherwise callable definer may become
  -- reachable only when USAGE is added. No function/extension grants are made.
  if exists (select 1 from pg_proc p where p.prosecdef
      and has_schema_privilege(runtime_oid, p.pronamespace, 'USAGE')
      and has_function_privilege(runtime_oid, p.oid, 'EXECUTE')) then
    raise exception 'Callable SECURITY DEFINER functions require separate review.';
  end if;
end
$prepare_runtime_role$;

select json_build_object(
  'prepared', true,
  'runtime_role', current_setting('cruush.role_runtime'),
  'login_enabled', (select rolcanlogin from pg_roles where rolname = current_setting('cruush.role_runtime')),
  'effective_temporary_privilege_unchanged', has_database_privilege(current_setting('cruush.role_runtime'), current_database(), 'TEMPORARY'),
  'ownership_transferred', false,
  'password_set', false,
  'public_privileges_changed', false
) as runtime_role_preparation;
commit;
