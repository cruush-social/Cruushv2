import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.CRUUSH_RUNTIME_ROLE_POSTGRES_TEST === "1";
const execute = promisify(execFile);
const proofPrefix = "/private/tmp/cruush-db-role-proof-";
const proofPort = 55447;
const admin = "cruush_role_proof_admin";
const owner = "cruush_role_proof_owner";
const runtime = "cruush_role_proof_runtime";
const database = "cruush_runtime_role_proof";
const sqlPath = fileURLToPath(new URL("../ops/runtime-role.sql", import.meta.url));
const safePreflightErrors = [
  "Runtime role preparation requires the exact expected database.",
  "Runtime and migration roles must be distinct valid identifiers.",
  "Existing runtime role has unsafe attributes; no attributes were changed.",
  "Existing runtime role has memberships requiring separate review.",
  "Runtime role owns database objects; ownership must remain separate.",
  "Effective database/schema CREATE privilege requires separate review, including PUBLIC grants.",
  "Runtime role has privileged server-parameter access.",
  "Runtime role has a trigger-bypassing startup setting.",
  "Runtime role has privileged routine or credential-catalog access.",
  "Existing effective relation privileges exceed runtime requirements.",
  "Existing default privileges would grant excessive runtime access.",
  "Callable SECURITY DEFINER functions require separate review."
];

// Explicit opt-in only. This owns a fresh PostgreSQL cluster, not a shared
// database/schema. No DATABASE_URL, production credentials, TCP listener,
// application workers, member data or outbound integrations are used.
describe.skipIf(!enabled)("restricted database runtime role on isolated PostgreSQL", () => {
  let root: string;
  let socket: string;
  let started = false;
  let control: pg.Client;
  let app: pg.Client;

  async function command(binary: string, args: string[]) {
    try {
      return await execute(binary, args, {
        // Preserve executable lookup only. Inherited PGPASSWORD/PGSERVICE or
        // production config must never influence this disposable proof.
        env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C", PGPASSFILE: path.join(root, "no-password-file") },
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024
      });
    } catch (error) {
      const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : "";
      const reason = safePreflightErrors.find((message) => stderr.includes(message));
      throw new Error(`${binary} failed in the isolated database-role proof.${reason ? ` ${reason}` : ""}`);
    }
  }

  async function provision(role = runtime, expected = database) {
    return command("psql", ["-X", "-qAt", "-h", socket, "-p", String(proofPort),
      "-U", admin, "-d", database, "-v", "ON_ERROR_STOP=1",
      "-v", `expected_database=${expected}`, "-v", `runtime_role=${role}`,
      "-v", `migration_owner=${owner}`, "-f", sqlPath]);
  }

  async function connect(user: string, target = database) {
    const client = new pg.Client({ host: socket, port: proofPort, database: target, user,
      connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
    await client.connect();
    return client;
  }

  beforeAll(async () => {
    root = await mkdtemp(proofPrefix);
    expect(await realpath(root)).toMatch(/^\/private\/tmp\/cruush-db-role-proof-[A-Za-z0-9]+$/);
    socket = path.join(root, "socket");
    await mkdir(socket, { mode: 0o700 });
    const version = await command("postgres", ["--version"]);
    expect(version.stdout).toMatch(/PostgreSQL\) 16\./);
    await command("initdb", ["-D", path.join(root, "data"), "-U", admin,
      "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8"]);
    await command("pg_ctl", ["-D", path.join(root, "data"), "-l", path.join(root, "postgres.log"),
      "-o", `-F -k '${socket}' -p ${proofPort} -h ''`, "-w", "start"]);
    started = true;
    control = await connect(admin, "postgres");
    await control.query(`create role ${owner} nologin`);
    await control.query(`create database ${database} owner ${owner}`);
    await control.end();
    control = await connect(admin);
    await control.query(`set role ${owner}`);
    await control.query(`
      create table public.app_users(id uuid primary key default gen_random_uuid(), email text unique not null);
      create table public.app_sessions(id bigint generated always as identity primary key,
        user_id uuid not null references public.app_users(id) on delete cascade, token_hash text not null);
      create table public.runtime_settings(id integer primary key, enabled boolean not null);
      insert into public.runtime_settings values (1,true);
      create function public.guard_runtime_session() returns trigger language plpgsql as $$
        begin
          if new.token_hash = 'rejected' or not (select enabled from public.runtime_settings where id=1) then
            raise exception 'synthetic trigger guard' using errcode='23514';
          end if;
          return new;
        end $$;
      create trigger runtime_session_guard before insert on public.app_sessions
        for each row execute function public.guard_runtime_session();
      create table public.extension_fixture(id integer);
    `);
    await control.query("reset role");
    // A disposable extension member with the approved owner proves that the
    // grant selection does not accidentally include extension-owned tables.
    await control.query("alter extension plpgsql add table public.extension_fixture");
    await control.query("create table public.unrelated_private(id integer)");
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await control?.end();
    if (!root) return;
    const resolved = await realpath(root);
    if (!/^\/private\/tmp\/cruush-db-role-proof-[A-Za-z0-9]+$/.test(resolved)) {
      throw new Error("Refusing cleanup outside this proof's private cluster.");
    }
    if (started) await command("pg_ctl", ["-D", path.join(root, "data"), "-m", "immediate", "-w", "stop"]);
    await rm(resolved, { recursive: true });
  }, 30_000);

  async function assertRejectedPreparation(setup: string, cleanup: string, reason: string, role = "cruush_role_proof_rejected") {
    await control.query(setup);
    try {
      await expect(provision(role)).rejects.toThrow(reason);
    } finally {
      await control.query(cleanup);
    }
  }

  it("refuses wrong databases and invalid role inputs without creating a role", async () => {
    await expect(provision("cruush_role_proof_rejected", "wrong_database")).rejects.toThrow("exact expected database");
    await expect(provision("bad-role")).rejects.toThrow("distinct valid identifiers");
    expect((await control.query("select count(*)::int as count from pg_roles where rolname='cruush_role_proof_rejected'")).rows[0].count).toBe(0);
  });

  it("rejects effective PUBLIC CREATE instead of revoking unrelated access", async () => {
    await assertRejectedPreparation("grant create on schema public to public", "revoke create on schema public from public", "Effective database/schema CREATE");
    await assertRejectedPreparation(`grant create on database ${database} to public`, `revoke create on database ${database} from public`, "Effective database/schema CREATE");
    expect((await control.query("select count(*)::int as count from pg_roles where rolname='cruush_role_proof_rejected'")).rows[0].count).toBe(0);
  });

  it("refuses unsafe existing attributes, memberships and ownership", async () => {
    await assertRejectedPreparation("create role cruush_role_proof_rejected nologin noinherit superuser", "drop role cruush_role_proof_rejected", "unsafe attributes");
    await assertRejectedPreparation(`create role cruush_role_proof_rejected nologin noinherit; grant ${owner} to cruush_role_proof_rejected`, "drop role cruush_role_proof_rejected", "memberships requiring separate review");
    await assertRejectedPreparation("create role cruush_role_proof_rejected nologin noinherit; create schema role_owned authorization cruush_role_proof_rejected", "drop schema role_owned; drop role cruush_role_proof_rejected", "owns database objects");
  });

  it("refuses inherited privileged relation, default and parameter permissions", async () => {
    await assertRejectedPreparation("grant truncate on public.app_users to public", "revoke truncate on public.app_users from public", "relation privileges exceed");
    await assertRejectedPreparation(`alter default privileges for role ${owner} in schema public grant truncate on tables to public`, `alter default privileges for role ${owner} in schema public revoke truncate on tables from public`, "default privileges would grant excessive");
    await assertRejectedPreparation("grant set on parameter session_replication_role to public", "revoke set on parameter session_replication_role from public", "privileged server-parameter access");
  });

  it("rejects direct or PUBLIC access to privileged builtins and credential catalogs", async () => {
    await assertRejectedPreparation("create role cruush_role_proof_rejected nologin noinherit; grant execute on function pg_catalog.pg_read_file(text) to cruush_role_proof_rejected",
      "revoke execute on function pg_catalog.pg_read_file(text) from cruush_role_proof_rejected; drop role cruush_role_proof_rejected", "privileged routine or credential-catalog access");
    await assertRejectedPreparation("grant execute on function pg_catalog.pg_read_file(text) to public",
      "revoke execute on function pg_catalog.pg_read_file(text) from public", "privileged routine or credential-catalog access");
    await assertRejectedPreparation("grant select on pg_catalog.pg_authid to public", "revoke select on pg_catalog.pg_authid from public", "privileged routine or credential-catalog access");
    await assertRejectedPreparation("grant select(rolpassword) on pg_catalog.pg_authid to public", "revoke select(rolpassword) on pg_catalog.pg_authid from public", "privileged routine or credential-catalog access");
  });

  it("rejects persisted role and database defaults that bypass runtime triggers", async () => {
    await assertRejectedPreparation("create role cruush_role_proof_rejected nologin noinherit; alter role cruush_role_proof_rejected set session_replication_role=replica",
      "drop role cruush_role_proof_rejected", "trigger-bypassing startup setting");
    await assertRejectedPreparation(`create role cruush_role_proof_rejected nologin noinherit; alter role cruush_role_proof_rejected in database ${database} set session_replication_role=replica`,
      "drop role cruush_role_proof_rejected", "trigger-bypassing startup setting");
    await assertRejectedPreparation(`alter database ${database} set session_replication_role=replica`,
      `alter database ${database} reset session_replication_role`, "trigger-bypassing startup setting");
  });

  it("refuses a callable SECURITY DEFINER function with all grants rolled back", async () => {
    await assertRejectedPreparation(`create function public.unsafe_role_proof() returns integer language sql security definer as 'select 1'`, "drop function public.unsafe_role_proof()", "Callable SECURITY DEFINER");
    expect((await control.query("select count(*)::int as count from pg_roles where rolname='cruush_role_proof_rejected'")).rows[0].count).toBe(0);
  });

  it("prepares a repeatable passwordless NOLOGIN role without changing ownership or PUBLIC", async () => {
    const before = (await control.query("select oid,relowner,relacl::text from pg_class where oid='public.unrelated_private'::regclass")).rows;
    const first = JSON.parse((await provision()).stdout.trim());
    expect(first).toMatchObject({ prepared: true, login_enabled: false, password_set: false,
      ownership_transferred: false, public_privileges_changed: false, effective_temporary_privilege_unchanged: true });
    await provision();
    expect((await control.query("select rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls from pg_roles where rolname=$1", [runtime])).rows[0])
      .toEqual({ rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false,
        rolinherit: false, rolreplication: false, rolbypassrls: false });
    expect((await control.query("select rolpassword is null as password_absent from pg_authid where rolname=$1", [runtime])).rows[0].password_absent).toBe(true);
    expect((await control.query("select oid,relowner,relacl::text from pg_class where oid='public.unrelated_private'::regclass")).rows).toEqual(before);
    expect((await control.query("select pg_get_userbyid(relowner) as owner from pg_class where oid='public.app_users'::regclass")).rows[0].owner).toBe(owner);
    await expect(connect(runtime)).rejects.toMatchObject({ code: "28000" });
    // Synthetic local socket activation only: no password is created or set.
    await control.query(`alter role ${runtime} login`);
    app = await connect(runtime);
    expect(JSON.parse((await provision()).stdout.trim()).login_enabled).toBe(true);
  });

  it("allows application DML, upsert, row locking, sequence allocation and invoker triggers", async () => {
    const id = (await app.query("insert into public.app_users(email) values('role-proof@example.invalid') returning id")).rows[0].id;
    await app.query("insert into public.app_users(id,email) values($1,'updated@example.invalid') on conflict(id) do update set email=excluded.email", [id]);
    await app.query("begin");
    expect((await app.query("select email from public.app_users where id=$1 for update", [id])).rows[0].email).toBe("updated@example.invalid");
    await app.query("commit");
    expect((await app.query("insert into public.app_sessions(user_id,token_hash) values($1,'synthetic') returning id", [id])).rows[0].id).toBe("1");
    await expect(app.query("insert into public.app_sessions(user_id,token_hash) values($1,'rejected')", [id])).rejects.toMatchObject({ code: "23514" });
    await app.query("update public.app_sessions set token_hash='changed'");
    await app.query("delete from public.app_users where id=$1", [id]);
    expect((await app.query("select count(*)::int as count from public.app_sessions")).rows[0].count).toBe(0);
  });

  it("denies schema DDL, trigger bypass, escalation, sequence reset and unrelated data", async () => {
    for (const sql of [
      "create table public.forbidden(id integer)", "create schema forbidden",
      "alter table public.app_users add column forbidden boolean", "drop table public.app_sessions",
      "truncate public.app_users", "alter table public.app_sessions disable trigger all",
      "create role forbidden", `set role ${owner}`, "set session_replication_role=replica",
      "select pg_read_file('PG_VERSION',0,2)", "select setval('public.app_sessions_id_seq',100)",
      "select * from public.extension_fixture", "select * from public.unrelated_private"
    ]) await expect(app.query(sql)).rejects.toMatchObject({ code: "42501" });
    expect((await app.query("select current_user as role")).rows[0].role).toBe(runtime);
  });

  it("grants required access to future migration-owned tables and sequences only", async () => {
    await control.query(`set role ${owner}`);
    await control.query("create table public.future_runtime(id bigint generated always as identity primary key, body text not null)");
    await control.query("reset role");
    await control.query("create table public.future_unrelated(id integer)");
    expect((await app.query("insert into public.future_runtime(body) values('synthetic') returning id,body")).rows[0])
      .toEqual({ id: "1", body: "synthetic" });
    await app.query("update public.future_runtime set body='updated'");
    await app.query("delete from public.future_runtime");
    await expect(app.query("truncate public.future_runtime")).rejects.toMatchObject({ code: "42501" });
    await expect(app.query("select setval('public.future_runtime_id_seq',100)")).rejects.toMatchObject({ code: "42501" });
    await expect(app.query("select * from public.future_unrelated")).rejects.toMatchObject({ code: "42501" });
    const source = await readFile(sqlPath, "utf8");
    expect(source).not.toMatch(/grant\s+(?:all|execute)\s+/i);
  });
});
