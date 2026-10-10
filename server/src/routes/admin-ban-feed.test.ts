import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config.js";
import { createPool, type DbClient } from "../db.js";
import { formatError, toApiError } from "../errors.js";
import { registerAdminModerationRoutes } from "./admin-moderation.js";

const { deleteObject, suspensionMail } = vi.hoisted(() => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
  suspensionMail: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("../media-storage.js", async (original) => ({
  ...await original<typeof import("../media-storage.js")>(),
  deleteEncryptedMediaObject: deleteObject
}));
vi.mock("../mailer.js", async (original) => ({
  ...await original<typeof import("../mailer.js")>(),
  sendAgeSuspensionAppealEmail: suspensionMail,
  sendGeneralSuspensionAppealEmail: suspensionMail
}));

const sourceUrl = process.env.CRUUSH_BAN_FEED_POSTGRES_URL;
const migrationUrl = new URL("../../sql/220_removed_feed_post_report_targets.sql", import.meta.url);

// This proof copies schema, never seed/member data, to a randomly named local
// database. It does not apply a migration to the source database or run workers.
describe.skipIf(!sourceUrl)("manual ban Feed deletion with real PostgreSQL", () => {
  const databaseName = `cruush_ban_feed_${randomUUID().replaceAll("-", "")}`;
  let control: pg.Client;
  let db: DbClient;
  let app: FastifyInstance;
  let created = false;
  let migration: string;
  let proofUrl: string;
  let failAudit = false;
  let failMediaTombstone = false;
  const statements: string[] = [];
  const logs: string[] = [];
  const externalFetch = vi.fn(async () => { throw new Error("External calls are disabled in ban proof"); });

  beforeAll(async () => {
    const source = new URL(sourceUrl!);
    expect(source.hostname).toBe("127.0.0.1");
    expect(source.port).toBe("5432");
    expect(source.pathname).toBe("/cruush_v2_integrate_20261009");
    expect(source.password).toBe("");
    expect(databaseName).toMatch(/^cruush_ban_feed_[a-f0-9]{32}$/);
    control = new pg.Client({ connectionString: source.toString() });
    await control.connect();
    expect((await control.query("select current_database() as name")).rows[0].name)
      .toBe("cruush_v2_integrate_20261009");
    let schema: string;
    try {
      schema = execFileSync("pg_dump", [source.toString(), "--schema-only", "--no-owner", "--no-privileges"], {
        encoding: "utf8", maxBuffer: 32 * 1024 * 1024
      });
    } catch {
      throw new Error("Could not read the local synthetic database schema");
    }
    await control.query(`create database ${databaseName}`);
    created = true;
    const destination = new URL(source.toString());
    destination.pathname = `/${databaseName}`;
    proofUrl = destination.toString();
    try {
      execFileSync("psql", [proofUrl, "-X", "-v", "ON_ERROR_STOP=1"], {
        input: schema, encoding: "utf8", maxBuffer: 32 * 1024 * 1024
      });
    } catch {
      throw new Error("Could not load the schema-only disposable ban proof database");
    }
    destination.searchParams.set("application_name", "cruush-ban-feed-proof");
    destination.searchParams.set("options", "-c statement_timeout=10000 -c lock_timeout=5000");
    db = createPool({ DATABASE_URL: destination.toString() });
    migration = await readFile(migrationUrl, "utf8");
    const columnQuery = "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'removed_post_id'";
    const originalColumns = await db.query(columnQuery);
    // Prove transactional DDL rollback before applying the additive migration.
    await expect(db.transaction!(async (tx) => {
      await tx.query(migration);
      throw new Error("synthetic migration rollback");
    })).rejects.toThrow("synthetic migration rollback");
    expect((await db.query(columnQuery)).rows).toEqual(originalColumns.rows);
    await db.transaction!(async (tx) => { await tx.query(migration); });
    await db.transaction!(async (tx) => { await tx.query(migration); });

    const routeDb: DbClient = {
      query<T>(sql: string, values?: unknown[]) {
        statements.push(sql);
        if (failMediaTombstone && sql.includes("with deleted_media as")) {
          throw new Error("synthetic media tombstone failure");
        }
        return db.query<T>(sql, values);
      },
      end: async () => {},
      async transaction<T>(operation: (client: DbClient) => Promise<T>) {
        const result = await db.transaction!(async (tx) => operation({
          query<Row>(sql: string, values?: unknown[]) {
            statements.push(sql);
            if (failAudit && sql.includes("insert into moderation_actions")) {
              throw new Error("synthetic audit failure");
            }
            return tx.query<Row>(sql, values);
          },
          end: async () => {}
        }));
        statements.push("proof:transaction committed");
        return result;
      }
    };
    app = Fastify({ logger: { level: "warn", stream: { write(line: string) { logs.push(line); } } } });
    app.decorate("config", {
      NODE_ENV: "test", APP_URL: "http://localhost:5173", SESSION_SECRET: "synthetic-ban-proof-only",
      RESEND_API_KEY: "", MAIL_FROM: "", EMAIL_PREVIEW_ENABLED: false, WEB_PUSH_ENABLED: false
    } as AppConfig);
    app.decorate("db", routeDb);
    app.setErrorHandler((error, _request, reply) => {
      const apiError = toApiError(error);
      reply.code(apiError.statusCode).send(formatError(apiError));
    });
    await registerAdminModerationRoutes(app);
    await app.ready();
  }, 60_000);

  beforeEach(() => {
    failAudit = false;
    failMediaTombstone = false;
    statements.length = 0;
    logs.length = 0;
    deleteObject.mockReset().mockResolvedValue(undefined);
    suspensionMail.mockClear();
    externalFetch.mockClear();
    vi.stubGlobal("fetch", externalFetch);
  });
  afterEach(() => {
    expect(externalFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
    if (created) {
      expect(databaseName).toMatch(/^cruush_ban_feed_[a-f0-9]{32}$/);
      // Only the database this run successfully created may be removed.
      await control.query(`drop database ${databaseName}`);
    }
    await control?.end();
  });

  async function fixture() {
    const member = randomUUID();
    const moderator = randomUUID();
    const reporter = randomUUID();
    const postIds = [randomUUID(), randomUUID(), randomUUID()];
    const reportId = randomUUID();
    const reviewId = randomUUID();
    const evidenceId = randomUUID();
    const pulseId = randomUUID();
    const mediaId = randomUUID();
    const unlinkedMediaId = randomUUID();
    await db.transaction!(async (tx) => {
      for (const id of [member, moderator, reporter]) {
        await tx.query(
          "insert into app_users (id, email, password_hash) values ($1, $2, 'synthetic-password-hash')",
          [id, `ban-proof-${id}@example.test`]
        );
        await tx.query("insert into profiles (id, display_name) values ($1, 'Synthetic ban proof')", [id]);
      }
      await tx.query("insert into moderator_users (user_id, role) values ($1, 'moderator')", [moderator]);
      await tx.query(
        "insert into app_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')",
        [member, `synthetic-${randomUUID()}`]
      );
      await tx.query(
        `insert into map_pings (id, user_id, radius_miles, idempotency_key, created_at, expires_at)
         values ($1, $2, 1, $3, now() - interval '1 minute', now() + interval '1 hour')`,
        [pulseId, member, randomUUID()]
      );
      await tx.query(
        `insert into posts (id, user_id, content, expires_in, expires_at, map_ping_id)
         values ($1, $4, 'Synthetic ordinary Feed post', 'never', 'infinity', null),
                ($2, $4, 'Synthetic Pulse Feed post', '1h', now() + interval '1 hour', $5),
                ($3, $4, 'Synthetic expired Feed post', '1h', now() - interval '1 hour', null)`,
        [...postIds, member, pulseId]
      );
      await tx.query(
        `insert into content_reviews (id, user_id, surface, content_type, status, content_id, moderation_status)
         values ($1, $2, 'feed', 'text', 'closed', $3, 'allowed')`,
        [reviewId, member, postIds[0]]
      );
      await tx.query(
        `insert into evidence_events (id, target_user_id, source_type, category, evidence_value, expires_at, metadata)
         values ($1, $2, 'report', 'harassment', 50, now() + interval '90 days', '{"synthetic":true}')`,
        [evidenceId, member]
      );
      await tx.query(
        `insert into reports (id, reporter_user_id, target_type, target_user_id, post_id, content_review_id, evidence_event_id,
                              reason, details, status, created_at, updated_at)
         values ($1, $2, 'post', $3, $4, $5, $6, 'harassment', 'Synthetic retained report evidence', 'open',
                 '2026-10-09 12:00:00+00', '2026-10-09 12:01:00+00')`,
        [reportId, reporter, member, postIds[0], reviewId, evidenceId]
      );
      for (const id of [mediaId, unlinkedMediaId]) {
        await tx.query(
          `insert into media_objects (id, owner_user_id, surface, object_key, media_type, mime_type, byte_size,
             encrypted_data_key, data_key_nonce, data_key_auth_tag, content_nonce, content_auth_tag, key_version,
             moderation_status)
           values ($1, $2, 'feed_photo', $3, 'image', 'image/jpeg', 1, 'synthetic', 'synthetic', 'synthetic',
                   'synthetic', 'synthetic', 'v1', 'approved')`,
          [id, member, `synthetic-ban-proof/${id}/original`]
        );
      }
      await tx.query(
        `insert into media_variants (media_object_id, variant_type, object_key, mime_type, width, height,
             byte_size, encrypted_data_key, data_key_nonce, data_key_auth_tag, content_nonce, content_auth_tag, key_version)
         values ($1, 'display', $2, 'image/jpeg', 1, 1, 1, 'synthetic', 'synthetic', 'synthetic', 'synthetic', 'synthetic', 'v1')`,
        [mediaId, `synthetic-ban-proof/${mediaId}/display`]
      );
      await tx.query("insert into feed_post_attachments (post_id, media_object_id, position) values ($1, $2, 0)", [postIds[0], mediaId]);
      await tx.query("insert into feed_post_tags (post_id, tag, position) values ($1, 'synthetic', 0)", [postIds[0]]);
      await tx.query(
        "insert into feed_post_crowd_targets (post_id, crowd, token_hash, token_key_version) values ($1, 'T4T', 'synthetic', 'v1')",
        [postIds[0]]
      );
    });
    return { member, moderator, reporter, postIds, reportId, reviewId, evidenceId, pulseId, mediaId, unlinkedMediaId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const setStatus = (f: Fixture, status = "banned", actor = f.moderator) => app.inject({
    method: "POST", url: `/api/admin/moderation/users/${f.member}/status`,
    headers: { "x-user-id": actor },
    payload: { status, reasonCode: "synthetic_manual_ban", notes: "Synthetic proof only", reportId: f.reportId }
  });
  async function counts(f: Fixture) {
    return (await db.query(
      `select (select count(*)::int from posts where user_id = $1) as posts,
              (select count(*)::int from app_sessions where user_id = $1) as sessions,
              (select count(*)::int from moderation_actions where target_user_id = $1) as actions,
              (select account_status from app_users where id = $1) as status,
              (select expires_at > now() from map_pings where id = $2) as pulse_live`,
      [f.member, f.pulseId]
    )).rows[0];
  }
  async function report(f: Fixture) {
    return (await db.query("select * from reports where id = $1", [f.reportId])).rows[0];
  }

  it("atomically deletes every Feed post, retains reports, and cleans only attachments after commit", async () => {
    const f = await fixture();
    const untouched = await fixture();
    const previousReport = await report(f);
    let committedCleanupCalls = 0;
    deleteObject.mockImplementation(async () => {
      expect(await counts(f)).toMatchObject({ posts: 0, sessions: 0, status: "banned", actions: 1, pulse_live: false });
      committedCleanupCalls += 1;
    });
    const response = await setStatus(f);
    expect(response.statusCode, response.body).toBe(200);
    expect(await report(f)).toEqual({ ...previousReport, post_id: null, removed_post_id: f.postIds[0] });
    expect((await db.query("select id from content_reviews where id = $1", [f.reviewId])).rows).toHaveLength(1);
    expect((await db.query("select target_user_id, metadata from evidence_events where id = $1", [f.evidenceId])).rows[0])
      .toEqual({ target_user_id: f.member, metadata: { synthetic: true } });
    expect((await db.query("select metadata from moderation_actions where target_user_id = $1", [f.member])).rows[0])
      .toEqual({ metadata: { previousStatus: "active", newStatus: "banned", removedFeedPostCount: 3, expiredFeedPulseCount: 1 } });
    expect(committedCleanupCalls).toBe(2);
    expect((await db.query("select deleted_at is not null as removed from media_objects where id = $1", [f.mediaId])).rows[0].removed).toBe(true);
    expect((await db.query("select deleted_at is not null as removed from media_variants where media_object_id = $1", [f.mediaId])).rows[0].removed).toBe(true);
    expect((await db.query("select deleted_at from media_objects where id = $1", [f.unlinkedMediaId])).rows[0].deleted_at).toBeNull();
    for (const table of ["feed_post_attachments", "feed_post_tags", "feed_post_crowd_targets"]) {
      expect((await db.query(`select 1 from ${table} where post_id = any($1::uuid[])`, [f.postIds])).rows).toHaveLength(0);
    }
    expect(await counts(untouched)).toMatchObject({ posts: 3, sessions: 1, status: "active", actions: 0, pulse_live: true });
    const commitIndex = statements.indexOf("proof:transaction committed");
    expect(commitIndex).toBeGreaterThan(-1);
    expect(statements.findIndex((sql) => sql.includes("with deleted_media as"))).toBeGreaterThan(commitIndex);
    expect(suspensionMail).not.toHaveBeenCalled();
  });

  it("rolls back status, posts, report links, Pulse expiry, and sessions if audit insertion fails", async () => {
    const f = await fixture();
    const before = await counts(f);
    const previousReport = await report(f);
    failAudit = true;
    expect((await setStatus(f)).statusCode).toBe(500);
    expect(await counts(f)).toEqual(before);
    expect(await report(f)).toEqual(previousReport);
    expect((await db.query("select 1 from feed_post_attachments where post_id = $1", [f.postIds[0]])).rows).toHaveLength(1);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(statements).not.toContain("proof:transaction committed");
  });

  it.each(["under_review", "suspended", "active"])("does not remove Feed posts when status is %s", async (status) => {
    const f = await fixture();
    const previousReport = await report(f);
    const response = await setStatus(f, status);
    expect(response.statusCode, response.body).toBe(200);
    expect(await counts(f)).toMatchObject({ posts: 3, pulse_live: true, status });
    expect(await report(f)).toEqual(previousReport);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(statements.some((sql) => sql.includes("delete from posts"))).toBe(false);
  });

  it("keeps a committed ban when object cleanup fails, and does not restore posts on unban", async () => {
    const f = await fixture();
    deleteObject.mockRejectedValue(new Error(`synthetic storage failure ${f.mediaId}`));
    expect((await setStatus(f)).statusCode).toBe(200);
    expect(await counts(f)).toMatchObject({ posts: 0, sessions: 0, status: "banned" });
    expect((await db.query("select deleted_at is not null as removed from media_objects where id = $1", [f.mediaId])).rows[0].removed).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain(f.mediaId);
    expect(logs.join("\n")).not.toContain("synthetic storage failure");
    expect(logs.every((line) => !("err" in JSON.parse(line)) && !("assetId" in JSON.parse(line)))).toBe(true);
    expect((await setStatus(f, "active")).statusCode).toBe(200);
    expect(await counts(f)).toMatchObject({ posts: 0, status: "active", pulse_live: false });
  });

  it("does not roll back a successful ban when the post-commit media tombstone query fails", async () => {
    const f = await fixture();
    failMediaTombstone = true;
    expect((await setStatus(f)).statusCode).toBe(200);
    expect(await counts(f)).toMatchObject({ posts: 0, sessions: 0, status: "banned" });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("banned Feed post media cleanup failed");
    expect(logs.join("\n")).not.toContain("synthetic media tombstone failure");
    // No live post/attachment remains, so Feed-media access is denied even if
    // physical cleanup must be retried separately.
    expect((await db.query("select 1 from feed_post_attachments where media_object_id = $1", [f.mediaId])).rows).toHaveLength(0);
  });

  it("preserves report links on replay and leaves previously banned unrelated accounts alone", async () => {
    const f = await fixture();
    const untouched = await fixture();
    await db.query("update app_users set account_status = 'banned' where id = $1", [untouched.member]);
    expect((await setStatus(f)).statusCode).toBe(200);
    const retained = await report(f);
    await db.transaction!(async (tx) => { await tx.query(migration); });
    expect((await setStatus(f)).statusCode).toBe(200);
    expect(await report(f)).toEqual(retained);
    expect(await counts(untouched)).toMatchObject({ posts: 3, status: "banned", sessions: 1, actions: 0 });
    expect(deleteObject).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing reported-content removal route working without changing report type", async () => {
    const f = await fixture();
    const response = await app.inject({
      method: "POST", url: `/api/admin/moderation/reports/${f.reportId}/remove-content`,
      headers: { "x-user-id": f.moderator }, payload: { reasonCode: "synthetic_remove", notes: "Synthetic proof" }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(await report(f)).toMatchObject({ target_type: "post", target_user_id: f.member, post_id: null,
      removed_post_id: f.postIds[0], target_account_deleted_at: null, status: "resolved" });
  });

  it("keeps genuine later account deletion compatible with retained removed-post reports", async () => {
    const f = await fixture();
    expect((await setStatus(f)).statusCode).toBe(200);
    await db.query("delete from app_users where id = $1", [f.member]);
    const retained = await report(f);
    expect(retained).toMatchObject({ target_type: "post", target_user_id: null, post_id: null,
      removed_post_id: f.postIds[0], details: "Synthetic retained report evidence", status: "open" });
    expect(retained.target_account_deleted_at).not.toBeNull();
  });

  it("preserves a legacy post report with no target account without inventing account-deletion state", async () => {
    const f = await fixture();
    await db.query("update reports set target_user_id = null where id = $1", [f.reportId]);
    const previousReport = await report(f);
    expect((await setStatus(f)).statusCode).toBe(200);
    expect(await report(f)).toEqual({ ...previousReport, post_id: null, removed_post_id: f.postIds[0] });
  });

  it("still rejects missing post targets and does not loosen other report-target branches", async () => {
    const f = await fixture();
    for (const type of ["post", "user", "profile", "message", "conversation", "profile_photo", "place", "place_message"]) {
      await expect(db.query(
        "insert into reports (reporter_user_id, target_type, reason) values ($1, $2, 'harassment')", [f.reporter, type]
      )).rejects.toMatchObject({ code: "23514", constraint: "reports_target_required_check" });
    }
  });

  it("rejects a nonmoderator and self-ban without removing content", async () => {
    const f = await fixture();
    expect((await setStatus(f, "banned", f.reporter)).statusCode).toBe(403);
    expect((await setStatus(f, "banned", f.member)).statusCode).toBe(403);
    await db.query("insert into moderator_users (user_id, role) values ($1, 'moderator')", [f.member]);
    expect((await setStatus(f, "banned", f.member)).statusCode).toBe(400);
    expect(await counts(f)).toMatchObject({ posts: 3, status: "active", actions: 0 });
  });

  async function waitForRouteLock() {
    for (let n = 0; n < 150; n++) {
      const result = await db.query<{ blocked: boolean }>(
        `select exists (select 1 from pg_stat_activity
         where datname = current_database() and application_name = 'cruush-ban-feed-proof'
           and wait_event_type = 'Lock') as blocked`
      );
      if (result.rows[0].blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected route transaction to wait on the synthetic lock");
  }

  it("preserves a report committed while the ban is waiting for its post lock", async () => {
    const f = await fixture();
    const writer = new pg.Client({ connectionString: proofUrl });
    await writer.connect();
    let pending: ReturnType<typeof setStatus> | undefined;
    const concurrentReport = randomUUID();
    try {
      await writer.query("begin");
      await writer.query(
        `insert into reports (id, reporter_user_id, target_type, target_user_id, post_id, reason)
         values ($1, $2, 'post', $3, $4, 'harassment')`,
        [concurrentReport, f.reporter, f.member, f.postIds[1]]
      );
      pending = setStatus(f);
      // Fastify injection starts when its thenable is consumed.
      const response = Promise.resolve(pending);
      await waitForRouteLock();
      await writer.query("commit");
      expect((await response).statusCode).toBe(200);
      expect((await db.query("select post_id, removed_post_id, target_type, target_user_id from reports where id = $1", [concurrentReport])).rows[0])
        .toEqual({ post_id: null, removed_post_id: f.postIds[1], target_type: "post", target_user_id: f.member });
    } finally {
      await writer.query("rollback");
      if (pending) await pending;
      await writer.end();
    }
  });

  it("waits for existing report removal in report-then-post order and still completes the ban", async () => {
    const f = await fixture();
    const remover = new pg.Client({ connectionString: proofUrl });
    await remover.connect();
    let pending: ReturnType<typeof setStatus> | undefined;
    try {
      await remover.query("begin");
      await remover.query("select id from reports where id = $1 for update", [f.reportId]);
      pending = setStatus(f);
      const response = Promise.resolve(pending);
      await waitForRouteLock();
      await remover.query("delete from posts where id = $1", [f.postIds[0]]);
      await remover.query("commit");
      expect((await response).statusCode).toBe(200);
      expect(await counts(f)).toMatchObject({ posts: 0, sessions: 0, status: "banned", pulse_live: false });
      expect(await report(f)).toMatchObject({ post_id: null, removed_post_id: f.postIds[0], target_type: "post" });
    } finally {
      await remover.query("rollback");
      if (pending) await pending;
      await remover.end();
    }
  });
});
