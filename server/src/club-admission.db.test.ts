import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";
import { formatError, toApiError } from "./errors.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import { registerClubRoutes } from "./routes/clubs.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { buildClubEnrollmentPayload, createClubEnrollmentUserIndex, findClubEnrollment, listClubMemberships, upsertClubEnrollment } from "./encrypted-club-enrollments.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility } from "./profile-sensitive.js";

const mocks = vi.hoisted(() => ({ relationship: vi.fn(), hidden: vi.fn(), notification: vi.fn() }));
vi.mock("./match-relationships.js", async (original) => ({ ...await original<typeof import("./match-relationships.js")>(), getRelationshipPermissions: mocks.relationship }));
vi.mock("./profile-oos-visibility.js", async (original) => ({ ...await original<typeof import("./profile-oos-visibility.js")>(), loadOosHiddenProfileIds: mocks.hidden }));
vi.mock("./notification-service.js", async (original) => ({ ...await original<typeof import("./notification-service.js")>(), createAppNotificationAndPush: mocks.notification }));

const sourceUrl = process.env.CRUUSH_CLUB_JOIN_POSTGRES_URL;
// Opt-in, schema-only clone of the specifically named local synthetic database.
// Never migrates the source, copies member data, starts workers or sends messages.
describe.skipIf(!sourceUrl)("Coven admission with real PostgreSQL", () => {
  const databaseName = `cruush_club_join_${randomUUID().replaceAll("-", "")}`;
  const config = { NODE_ENV: "test", SESSION_SECRET: "synthetic-club-proof-only", APP_URL: "http://localhost:5173", RESEND_API_KEY: "", MAIL_FROM: "", WEB_PUSH_ENABLED: false } as AppConfig;
  let control: pg.Client;
  let db: DbClient;
  let app: FastifyInstance;
  let created = false;
  let proofUrl: string;
  let failChatWrite = false;
  const externalFetch = vi.fn(async () => { throw new Error("External calls disabled in admission proof"); });
  beforeAll(async () => {
    const source = new URL(sourceUrl!);
    expect(source.hostname).toBe("127.0.0.1");
    expect(source.port).toBe("5432");
    expect(source.pathname).toBe("/cruush_v2_integrate_20261009");
    expect(source.password).toBe("");
    expect(source.search).toBe("");
    expect(databaseName).toMatch(/^cruush_club_join_[a-f0-9]{32}$/);
    control = new pg.Client({ connectionString: source.toString() });
    await control.connect();
    expect((await control.query("select current_database() as name")).rows[0].name).toBe("cruush_v2_integrate_20261009");
    const schema = execFileSync("pg_dump", [source.toString(), "--schema-only", "--no-owner", "--no-privileges"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    await control.query(`create database ${databaseName}`);
    created = true;
    const destination = new URL(source.toString());
    destination.pathname = `/${databaseName}`;
    proofUrl = destination.toString();
    execFileSync("psql", [proofUrl, "-X", "-v", "ON_ERROR_STOP=1"], { input: schema, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    destination.searchParams.set("application_name", "cruush-club-join-proof");
    destination.searchParams.set("options", "-c statement_timeout=10000 -c lock_timeout=5000");
    db = createPool({ DATABASE_URL: destination.toString() });
    const migration = await readFile(new URL("../sql/221_club_join_approval.sql", import.meta.url), "utf8");
    // Only in this run's empty disposable clone: simulate a pre-221 schema,
    // even if main has already migrated the source review database.
    await db.query("alter table clubs drop column if exists requires_join_approval");
    await db.query("insert into clubs(title) values ('Existing pre-221 Coven')");
    const before = await db.query("select column_name from information_schema.columns where table_name = 'clubs' and column_name = 'requires_join_approval'");
    await expect(db.transaction!(async (tx) => { await tx.query(migration); throw new Error("rollback proof"); })).rejects.toThrow("rollback proof");
    expect((await db.query("select column_name from information_schema.columns where table_name = 'clubs' and column_name = 'requires_join_approval'")).rows).toEqual(before.rows);
    await db.query(migration);
    await db.query(migration);
    expect((await db.query<{ requires_join_approval: boolean }>("select requires_join_approval from clubs where title='Existing pre-221 Coven'")).rows[0]?.requires_join_approval).toBe(true);
    const routeDb: DbClient = {
      query: db.query, end: async () => {},
      transaction: (operation) => db.transaction!(async (tx) => operation({
        query: async <T>(sql: string, values?: unknown[]) => {
          if (failChatWrite && sql.includes("insert into conversation_members")) throw new Error("synthetic chat write failure");
          return tx.query<T>(sql, values);
        }, end: async () => {}
      }))
    };
    app = Fastify({ logger: false });
    app.decorate("config", config);
    app.decorate("db", routeDb);
    app.decorate("rateLimiter", createMemoryRateLimiter());
    app.setErrorHandler((error, _request, reply) => { const apiError = toApiError(error); reply.code(apiError.statusCode).send(formatError(apiError)); });
    await registerClubRoutes(app);
    await registerMessageRoutes(app);
    await app.ready();
  }, 60_000);
  beforeEach(() => {
    failChatWrite = false;
    mocks.relationship.mockReset().mockResolvedValue({ canMessage: true, isMutualCruush: true });
    mocks.hidden.mockReset().mockResolvedValue(new Set());
    mocks.notification.mockReset().mockResolvedValue(undefined);
    externalFetch.mockClear();
    vi.stubGlobal("fetch", externalFetch);
  });
  afterEach(() => { expect(externalFetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
  afterAll(async () => {
    await app?.close(); await db?.end();
    if (created) { expect(databaseName).toMatch(/^cruush_club_join_[a-f0-9]{32}$/); await control.query(`drop database ${databaseName}`); }
    await control?.end();
  });

  async function fixture(count = 1, approval = false) {
    const clubId = randomUUID(), conversationId = randomUUID(), owner = randomUUID(), first = randomUUID(), second = randomUUID();
    await db.transaction!(async (tx) => {
      for (const userId of [owner, first, second]) {
        await tx.query("insert into app_users(id, email, password_hash) values ($1,$2,'synthetic')", [userId, `club-${userId}@example.test`]);
        await tx.query("insert into profiles(id, display_name) values ($1, 'Synthetic member')", [userId]);
      }
      await tx.query("insert into conversations(id,kind,title,created_by) values ($1,'group','Synthetic Coven',$2)", [conversationId, owner]);
      await tx.query("insert into clubs(id,title,directory_visible,conversation_id,requires_join_approval) values ($1,'Synthetic Coven',true,$2,$3)", [clubId, conversationId, approval]);
      for (let index = 0; index < count; index++) {
        const userId = index === 0 ? owner : randomUUID();
        await upsertClubEnrollment({ config, db: tx }, buildClubEnrollmentPayload({ type: "membership", status: "active", clubId, userId, role: index === 0 ? "owner" : "member" }));
        await tx.query("insert into conversation_members(conversation_id,user_id,member_index,role) values ($1,null,$2,'member')", [conversationId, createClubEnrollmentUserIndex(config, userId)]);
      }
    });
    return { clubId, conversationId, owner, first, second };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  type AdmissionPath = "join" | "approve" | "admin-add";
  function admission(f: Fixture, userId: string, path: AdmissionPath) {
    return app.inject(path === "join"
      ? { method: "POST", url: `/api/clubs/${f.clubId}/join-requests`, headers: { "x-user-id": userId } }
      : path === "approve"
        ? { method: "POST", url: `/api/clubs/${f.clubId}/join-requests/${userId}`, headers: { "x-user-id": f.owner }, payload: { decision: "approve" } }
        : { method: "POST", url: `/api/conversations/groups/${f.conversationId}/members`, headers: { "x-user-id": f.owner }, payload: { userId } });
  }
  async function pending(f: Fixture, userId: string) {
    await upsertClubEnrollment({ config, db }, buildClubEnrollmentPayload({ type: "join_request", status: "pending", clubId: f.clubId, userId, applicationAnswer: "Synthetic private answer" }));
  }

  it("defaults old-style inserts to approval and keeps pending details private", async () => {
    const f = await fixture(1, true);
    await db.query("insert into clubs(title) values ('Legacy default proof')");
    expect((await db.query<{ requires_join_approval: boolean }>("select requires_join_approval from clubs where title='Legacy default proof'")).rows[0]?.requires_join_approval).toBe(true);
    expect((await admission(f, f.first, "join")).json().data).toEqual({ joinRequestStatus: "pending" });
    const detail = await app.inject({ method: "GET", url: `/api/clubs/${f.clubId}`, headers: { "x-user-id": f.first } });
    expect(detail.json().data).toMatchObject({ requiresJoinApproval: true, conversationId: null, currentUserRole: null });
    expect((await app.inject({ method: "GET", url: `/api/clubs/${f.clubId}/join-requests`, headers: { "x-user-id": f.first } })).statusCode).toBe(403);
  });

  it.each([["join", "join"], ["join", "approve"], ["join", "admin-add"], ["approve", "admin-add"]] as const)("serializes %s against %s at 999 members", async (left, right) => {
    const f = await fixture(999);
    await pending(f, f.first); await pending(f, f.second);
    const blocker = new pg.Client({ connectionString: proofUrl });
    await blocker.connect(); await blocker.query("begin");
    await blocker.query("select id from clubs where id=$1 for update", [f.clubId]);
    const responses = [admission(f, f.first, left).then((response) => response), admission(f, f.second, right).then((response) => response)];
    try {
      let blocked = 0;
      for (let attempt = 0; attempt < 200 && blocked < 2; attempt++) {
        blocked = Number((await db.query<{ count: string }>("select count(*)::text from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%from clubs where id = $1 for update%'")).rows[0]?.count ?? 0);
        if (blocked < 2) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(2);
    } finally { await blocker.query("rollback"); await blocker.end(); }
    const results = await Promise.all(responses);
    expect(results.filter((r) => r.statusCode >= 200 && r.statusCode < 300)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(1);
    expect(await listClubMemberships({ config, db }, f.clubId)).toHaveLength(1000);
    const rows = await db.query<{ total: number; plaintext: number }>("select count(*)::int as total, count(user_id)::int as plaintext from conversation_members where conversation_id=$1", [f.conversationId]);
    expect(rows.rows[0]).toEqual({ total: 1000, plaintext: 0 });
  });

  it("rolls back enrollment and retains application when the chat write fails", async () => {
    const f = await fixture(); await pending(f, f.first); failChatWrite = true;
    expect((await admission(f, f.first, "join")).statusCode).toBe(500);
    expect(await findClubEnrollment({ config, db }, { clubId: f.clubId, userId: f.first, type: "membership" })).toBeNull();
    expect((await findClubEnrollment({ config, db }, { clubId: f.clubId, userId: f.first, type: "join_request" }))?.payload.applicationAnswer).toBe("Synthetic private answer");
  });

  it("makes duplicate direct joins idempotent and preserves the owner role", async () => {
    const f = await fixture();
    const results = await Promise.all([admission(f, f.first, "join"), admission(f, f.first, "join")]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(results[0].json().data).toEqual({ joinRequestStatus: "member", conversationId: f.conversationId });
    expect(await listClubMemberships({ config, db }, f.clubId)).toHaveLength(2);
    expect((await admission(f, f.owner, "join")).statusCode).toBe(201);
    expect((await findClubEnrollment({ config, db }, { clubId: f.clubId, userId: f.owner, type: "membership" }))?.payload.role).toBe("owner");
  });

  it("enforces visibility on open join and rejects damaged visibility ciphertext", async () => {
    const f = await fixture();
    const rules = encryptProfileVisibility(config, { ...emptyProfile.visibility_rules, search_query: "Synthetic member" });
    await db.query("update clubs set visibility_ciphertext=$2, visibility_nonce=$3, visibility_auth_tag=$4, visibility_key_version=$5 where id=$1", [f.clubId, rules.profile_visibility_ciphertext, rules.profile_visibility_nonce, rules.profile_visibility_auth_tag, rules.profile_visibility_key_version]);
    expect((await admission(f, f.first, "join")).statusCode).toBe(404);
    await db.query("update conversations set closed_at=now() where id=$1", [f.conversationId]);
    expect((await admission(f, f.first, "join")).statusCode).toBe(404);
    await db.query("update clubs set visibility_ciphertext='invalid' where id=$1", [f.clubId]);
    expect((await admission(f, f.first, "join")).statusCode).toBe(404);
    expect(await listClubMemberships({ config, db }, f.clubId)).toHaveLength(1);
  });

  it("retains admin-add mutual/block and hidden-profile gates", async () => {
    const f = await fixture();
    mocks.relationship.mockResolvedValue({ canMessage: false, isMutualCruush: true });
    expect((await admission(f, f.first, "admin-add")).statusCode).toBe(403);
    mocks.relationship.mockResolvedValue({ canMessage: true, isMutualCruush: true });
    mocks.hidden.mockResolvedValue(new Set([f.first]));
    expect((await admission(f, f.first, "admin-add")).statusCode).toBe(404);
    expect(await listClubMemberships({ config, db }, f.clubId)).toHaveLength(1);
  });

  it("completes nonpublic joins using a one-connection pool without nested acquisition", async () => {
    const f = await fixture();
    // Visibility search excludes matching people. This unmatched exclusion is
    // nonpublic but allows these two members, exercising both privacy reads.
    const rules = encryptProfileVisibility(config, { ...emptyProfile.visibility_rules, search_query: "absent-profile-text" });
    await db.query("update clubs set visibility_ciphertext=$2, visibility_nonce=$3, visibility_auth_tag=$4, visibility_key_version=$5 where id=$1", [f.clubId, rules.profile_visibility_ciphertext, rules.profile_visibility_nonce, rules.profile_visibility_auth_tag, rules.profile_visibility_key_version]);
    const pool = new pg.Pool({ connectionString: proofUrl, max: 1, connectionTimeoutMillis: 500, statement_timeout: 2000 });
    const tinyDb: DbClient = {
      query: async <T>(sql: string, values?: unknown[]) => {
        const result = await pool.query(sql, values);
        return { rows: result.rows as T[], rowCount: result.rowCount };
      },
      end: () => pool.end(),
      transaction: async <T>(operation: (client: DbClient) => Promise<T>) => {
        const connection = await pool.connect();
        try {
          await connection.query("begin");
          const result = await operation({
            query: async <Row>(sql: string, values?: unknown[]) => {
              const answer = await connection.query(sql, values);
              return { rows: answer.rows as Row[], rowCount: answer.rowCount };
            }, end: async () => {}
          });
          await connection.query("commit"); return result;
        } catch (error) { await connection.query("rollback"); throw error; }
        finally { connection.release(); }
      }
    };
    const tinyApp = Fastify({ logger: false });
    tinyApp.decorate("config", config); tinyApp.decorate("db", tinyDb);
    tinyApp.setErrorHandler((error, _request, reply) => { const apiError = toApiError(error); reply.code(apiError.statusCode).send(formatError(apiError)); });
    await registerClubRoutes(tinyApp);
    try {
      const results = await Promise.all([f.first, f.second].map((userId) => tinyApp.inject({ method: "POST", url: `/api/clubs/${f.clubId}/join-requests`, headers: { "x-user-id": userId } })));
      expect(results.map((response) => response.statusCode)).toEqual([201, 201]);
      expect(await listClubMemberships({ config, db }, f.clubId)).toHaveLength(3);
    } finally { await tinyApp.close(); await tinyDb.end(); }
  }, 5000);

  it("rejects inactive accounts, closed conversations, and denied/nonstaff review without new membership", async () => {
    const f = await fixture();
    await db.query("update app_users set account_status='banned' where id=$1", [f.first]);
    expect((await admission(f, f.first, "join")).statusCode).toBe(403);
    await pending(f, f.second);
    expect((await app.inject({ method: "POST", url: `/api/clubs/${f.clubId}/join-requests/${f.second}`, headers: { "x-user-id": f.first }, payload: { decision: "approve" } })).statusCode).toBe(403);
    await db.query("update conversations set closed_at=now() where id=$1", [f.conversationId]);
    expect((await admission(f, f.second, "join")).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/clubs/${f.clubId}/join-requests/${f.second}`, headers: { "x-user-id": f.owner }, payload: { decision: "deny" } })).statusCode).toBe(200);
    expect(await findClubEnrollment({ config, db }, { clubId: f.clubId, userId: f.second, type: "join_request" })).toBeNull();
    expect(await listClubMemberships({ config, db }, f.clubId)).toHaveLength(1);
  });
});
