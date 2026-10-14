import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { hashPassword, hashSessionToken, SESSION_COOKIE_NAME } from "./auth.js";
import { loadConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";
import { buildEncryptedRelationshipPayload, upsertEncryptedRelationshipRecord } from "./encrypted-relationships.js";
import { buildClubEnrollmentPayload, createClubEnrollmentUserIndex, upsertClubEnrollment } from "./encrypted-club-enrollments.js";
import { recordPrivacyAuditEvent } from "./location-privacy.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { readEncryptedMediaObject, writeEncryptedMediaObject } from "./media-storage.js";
import { saveBetaCityRequest } from "./beta-city-requests.js";

const databaseUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const users = ["aa000000-0000-4000-8000-000000000001", "aa000000-0000-4000-8000-000000000002", "aa000000-0000-4000-8000-000000000003"];
const assetId = "aa000000-0000-4000-8000-000000000101";
const conversationId = "aa000000-0000-4000-8000-000000000201";
const objectKeys = [`originals/${assetId}.enc`, `variants/${assetId}/thumbnail.webp.enc`, `variants/${assetId}/display.webp.enc`];
const password = "immediate-account-deletion-test";
const sessionToken = "immediate-account-deletion-session";

describe.skipIf(!databaseUrl)("immediate account data deletion", () => {
  let db: DbClient;
  let app: ReturnType<typeof buildServer>;
  let config: ReturnType<typeof loadConfig>;
  let mediaDir: string;
  let controlPool: InstanceType<typeof pg.Pool>;

  async function cleanFixtures() {
    await db.query("delete from encrypted_relationship_records where record_lookup_index in (select record_lookup_index from encrypted_relationship_records where created_at = '2001-01-01T00:00:00Z'::timestamptz)");
    await db.query("delete from encrypted_club_enrollments where created_at = '2001-01-01T00:00:00Z'::timestamptz");
    await db.query("delete from encrypted_privacy_audit_events where created_at_ms between 978307200000 and 978307200010");
    await db.query("delete from conversations where id = $1", [conversationId]);
    await db.query("delete from app_users where id = any($1::uuid[])", [users]);
    await db.query("delete from account_deletion_media_cleanup where object_key = any($1::text[])", [objectKeys]);
    await db.query("delete from rate_limit_buckets where bucket_key = $1", [`account-delete:user:${users[0]}`]);
    await db.query("delete from beta_city_requests where source = 'launch_beta_geofence' and requested_city_hash = $1",
      [(await import("./beta-city-requests.js")).betaCityRequestHash(config, "city", "Deletion fixture town")]);
  }
  beforeAll(async () => {
    if (!/^\/cruush_account_deletion_integrity(?:_[a-z0-9]+)*$/.test(new URL(databaseUrl!).pathname)) throw new Error("Use a disposable account-deletion database.");
    mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-immediate-deletion-"));
    config = loadConfig({ ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl!,
      SESSION_SECRET: "immediate-deletion-config", CORS_ORIGIN: "http://localhost:5173",
      MEDIA_OBJECT_STORAGE_DRIVER: "local", MEDIA_STORAGE_DIR: mediaDir });
    db = createPool(config);
    controlPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
    app = buildServer(config, { db: { ...db, end: async () => {} } });
    await app.ready();
  });
  beforeEach(async () => {
    await cleanFixtures();
    for (let i = 0; i < users.length; i++) await db.query("insert into app_users (id, email, password_hash, email_verified_at) values ($1, $2, $3, now())",
      [users[i], `immediate-delete-${i}@example.test`, await hashPassword(password)]);
    await db.query("insert into app_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')",
      [users[0], hashSessionToken(sessionToken)]);
    await db.query("insert into profiles (id, display_name) select unnest($1::uuid[]), 'Deletion fixture'", [users]);
  });
  afterEach(async () => { await cleanFixtures(); });
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.end();
    if (controlPool) await controlPool.end();
    if (mediaDir) await rm(mediaDir, { recursive: true, force: true });
  });

  function requestDeletion(server = app) {
    return server.inject({ method: "DELETE", url: "/api/auth/me",
      headers: { origin: "http://localhost:5173", cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
      payload: { password, confirmation: "DELETE" } });
  }
  async function insertMedia(client: DbClient = db) {
    const encrypted = encryptMediaBytes(config, Buffer.from("private test image"));
    for (const key of objectKeys) await writeEncryptedMediaObject(config, key, encrypted.ciphertext);
    const keys = [encrypted.encryptedDataKey, encrypted.dataKeyNonce, encrypted.dataKeyAuthTag,
      encrypted.nonce, encrypted.authTag, encrypted.keyVersion];
    await client.query(`insert into media_objects (id, owner_user_id, surface, object_key, media_type, mime_type,
      byte_size, encrypted_data_key, data_key_nonce, data_key_auth_tag, content_nonce, content_auth_tag,
      key_version, moderation_status, explicit_classification)
      values ($1, $2, 'profile_photo', $3, 'image', 'image/webp', 18, $4, $5, $6, $7, $8, $9, 'approved', 'non_explicit')`,
    [assetId, users[0], objectKeys[0], ...keys]);
    for (const [i, variant] of ["thumbnail", "display"].entries()) await client.query(`insert into media_variants (
      media_object_id, variant_type, object_key, mime_type, width, height, byte_size, encrypted_data_key,
      data_key_nonce, data_key_auth_tag, content_nonce, content_auth_tag, key_version)
      values ($1, $2, $3, 'image/webp', 1, 1, 18, $4, $5, $6, $7, $8, $9)`, [assetId, variant, objectKeys[i + 1], ...keys]);
  }

  it("removes encrypted activities, enrollment answers, privacy audits and media originals/variants before replying", async () => {
    await insertMedia();
    for (const version of ["v1", "v2"]) {
      const versionConfig = { ...config, RELATIONSHIP_INDEX_KEY_VERSION: version, CLUB_ENROLLMENT_INDEX_KEY_VERSION: version };
      for (const [actor, target] of [[users[0]!, users[1]!], [users[1]!, users[2]!]]) {
        await upsertEncryptedRelationshipRecord({ db, config: versionConfig }, buildEncryptedRelationshipPayload({
          type: "profile_view", actorUserId: actor, targetUserId: target, createdAt: "2001-01-01", targetSnapshot: { name: "Private snapshot", pronouns: "", photo: null }
        }));
        await upsertClubEnrollment({ db, config: versionConfig }, buildClubEnrollmentPayload({
          type: "join_request", status: "pending", userId: actor, clubId: conversationId, applicationAnswer: "Private join answer", createdAt: "2001-01-01"
        }));
      }
    }
    for (const [offset, subject, viewer] of [[0, users[0]!, users[1]!], [1, users[1]!, users[0]!], [2, users[1]!, users[2]!]] as const) {
      await recordPrivacyAuditEvent({ db, config }, { version: 1, subjectUserId: subject, viewerUserId: viewer,
        eventType: "precise_location_decision", permissionType: "mutual_cruush", reason: "Private decision",
        createdAtMs: 978307200000 + offset, revokedAtMs: null });
    }
    await db.query("insert into conversations (id, kind) values ($1, 'group')", [conversationId]);
    await db.query("insert into conversation_members (conversation_id, user_id, member_index) values ($1, null, $2)",
      [conversationId, createClubEnrollmentUserIndex(config, users[0]!)]);
    await saveBetaCityRequest({ db, config }, { email: "immediate-delete-0@example.test", requestedCity: "Deletion fixture town" });
    await db.query("insert into app_notifications (user_id, actor_user_id, type, title, body) values ($1, $2, 'incoming_cruush', 'Private profile snapshot', 'Private name')", [users[1], users[0]]);
    await db.query("insert into app_notifications (user_id, actor_user_id, type, title, body) values ($1, $2, 'incoming_cruush', 'Unrelated notification', '')", [users[1], users[2]]);
    const before = await app.inject({ method: "GET", url: `/api/media/assets/${assetId}/display`, headers: { "x-user-id": users[0]! } });
    expect(before.statusCode).toBe(200);
    expect(before.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect((await requestDeletion()).statusCode).toBe(204);
    expect((await db.query("select id from media_objects where id = $1", [assetId])).rows).toEqual([]);
    expect((await db.query("select id from media_variants where media_object_id = $1", [assetId])).rows).toEqual([]);
    for (const key of objectKeys) await expect(readEncryptedMediaObject(config, key)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await db.query("select count(*)::int as count from encrypted_relationship_records where created_at = '2001-01-01T00:00:00Z'")).rows[0]).toEqual({ count: 2 });
    expect((await db.query("select count(*)::int as count from encrypted_club_enrollments where created_at = '2001-01-01T00:00:00Z'")).rows[0]).toEqual({ count: 2 });
    expect((await db.query("select count(*)::int as count from encrypted_privacy_audit_events where created_at_ms between 978307200000 and 978307200010")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("select member_index from conversation_members where conversation_id = $1", [conversationId])).rows).toEqual([]);
    expect((await db.query("select title from app_notifications where user_id = $1", [users[1]])).rows).toEqual([{ title: "Unrelated notification" }]);
    expect((await db.query("select bucket_key from rate_limit_buckets where position($1 in bucket_key) > 0", [users[0]])).rows).toEqual([]);
    expect((await db.query("select count(*)::int as count from beta_city_requests where requested_city_hash = $1",
      [(await import("./beta-city-requests.js")).betaCityRequestHash(config, "city", "Deletion fixture town")])).rows[0]).toEqual({ count: 0 });
    const after = await app.inject({ method: "GET", url: `/api/media/assets/${assetId}/display`, headers: { "x-user-id": users[1]!, "if-none-match": before.headers.etag as string } });
    expect(after.statusCode).toBe(404);
  });

  it("waits for an in-flight media publication and includes its files in deletion", async () => {
    const upload = await controlPool.connect();
    let deletion: ReturnType<typeof requestDeletion> | undefined;
    try {
      await upload.query("begin");
      await insertMedia({ query: upload.query.bind(upload), end: async () => {} });
      deletion = requestDeletion();
      let waiting = false;
      for (let attempt = 0; attempt < 300; attempt++) {
        const result = await db.query("select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event is not null and query like 'select id, email, email_verified_at from app_users%'");
        if (Number(result.rows[0]?.count) > 0) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await upload.query("commit");
      expect((await deletion).statusCode).toBe(204);
      for (const key of objectKeys) await expect(readEncryptedMediaObject(config, key)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await upload.query("rollback");
      upload.release();
      if (deletion) await deletion;
    }
  }, 15_000);

  it("removes exact legacy encrypted owners after index-key rotation while preserving another member's records", async () => {
    const historical = { ...config, RELATIONSHIP_INDEX_KEY: "historic-test-index", CLUB_ENROLLMENT_INDEX_KEY: "historic-test-index",
      LOCATION_INDEX_KEY: "historic-test-index", LOCATION_INDEX_KEY_VERSION: "legacy-index-9" };
    for (const [actor, target] of [[users[0]!, users[1]!], [users[1]!, users[2]!]]) {
      await upsertEncryptedRelationshipRecord({ db, config: historical }, buildEncryptedRelationshipPayload({
        type: "cruush", actorUserId: actor, targetUserId: target, createdAt: "2001-01-01"
      }));
      await upsertClubEnrollment({ db, config: historical }, buildClubEnrollmentPayload({
        type: "join_request", status: "pending", userId: actor, clubId: conversationId, applicationAnswer: "Historic private answer", createdAt: "2001-01-01"
      }));
      await recordPrivacyAuditEvent({ db, config: historical }, { version: 1, subjectUserId: actor, viewerUserId: target,
        eventType: "precise_location_decision", permissionType: "mutual_cruush", reason: "Historic audit",
        createdAtMs: 978307200000 + (actor === users[0] ? 0 : 1), revokedAtMs: null });
    }
    await db.query("update encrypted_privacy_audit_events set index_key_version = null where created_at_ms between 978307200000 and 978307200010");
    expect((await requestDeletion()).statusCode).toBe(204);
    expect((await db.query("select count(*)::int as count from encrypted_relationship_records where created_at = '2001-01-01T00:00:00Z'")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("select count(*)::int as count from encrypted_club_enrollments where created_at = '2001-01-01T00:00:00Z'")).rows[0]).toEqual({ count: 1 });
    expect((await db.query("select count(*)::int as count from encrypted_privacy_audit_events where created_at_ms between 978307200000 and 978307200010")).rows[0]).toEqual({ count: 1 });
  });

  it("preserves another person's city submission referenced by an unverified support address", async () => {
    await saveBetaCityRequest({ db, config }, { email: "immediate-delete-1@example.test", requestedCity: "Deletion fixture town" });
    await db.query(`insert into support_requests (requester_user_id, contact_email, category, subject, message, source)
      values ($1, 'immediate-delete-1@example.test', 'question', 'Different contact address', 'No proof of ownership.', 'settings')`, [users[0]]);
    expect((await requestDeletion()).statusCode).toBe(204);
    expect((await db.query("select count(*)::int as count from beta_city_requests where requested_city_hash = $1",
      [(await import("./beta-city-requests.js")).betaCityRequestHash(config, "city", "Deletion fixture town")])).rows[0]).toEqual({ count: 1 });
  });

  it("does not claim an anonymous city submission through an unverified account email", async () => {
    await db.query("update app_users set email_verified_at = null where id = $1", [users[0]]);
    await saveBetaCityRequest({ db, config }, { email: "immediate-delete-0@example.test", requestedCity: "Deletion fixture town" });
    expect((await requestDeletion()).statusCode).toBe(204);
    expect((await db.query("select count(*)::int as count from beta_city_requests where requested_city_hash = $1",
      [(await import("./beta-city-requests.js")).betaCityRequestHash(config, "city", "Deletion fixture town")])).rows[0]).toEqual({ count: 1 });
  });

  it("rejects delayed encrypted writes once deletion owns the account lock", async () => {
    let announce!: () => void;
    let release!: () => void;
    const locked = new Promise<void>(resolve => { announce = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const wrapped: DbClient = { ...db, end: async () => {}, transaction: callback => db.transaction!(client => callback({
      ...client, query: async <T>(sql: string, params?: unknown[]) => {
        const result = await client.query<T>(sql, params);
        if (sql.startsWith("select id, email, email_verified_at from app_users")) { announce(); await hold; }
        return result;
      }
    })) };
    const server = buildServer(config, { db: wrapped });
    const deletion = requestDeletion(server);
    await locked;
    const relationship = upsertEncryptedRelationshipRecord({ db, config }, buildEncryptedRelationshipPayload({
      type: "cruush", actorUserId: users[1]!, targetUserId: users[0]!, createdAt: "2001-01-01"
    }));
    const enrollment = upsertClubEnrollment({ db, config }, buildClubEnrollmentPayload({
      type: "join_request", status: "pending", userId: users[0]!, clubId: conversationId,
      applicationAnswer: "Cannot resurrect", createdAt: "2001-01-01"
    }));
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 300; attempt++) {
        const result = await db.query("select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event is not null and query like 'with account_owner%'");
        if (Number(result.rows[0]?.count) >= 2) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      release();
      expect((await deletion).statusCode).toBe(204);
      expect(await relationship).toBeNull();
      expect(await enrollment).toBeNull();
      expect((await db.query("select id from encrypted_relationship_records where created_at = '2001-01-01T00:00:00Z'")).rows).toEqual([]);
      expect((await db.query("select id from encrypted_club_enrollments where created_at = '2001-01-01T00:00:00Z'")).rows).toEqual([]);
    } finally {
      release();
      await Promise.allSettled([deletion, relationship, enrollment]);
      await server.close();
    }
  }, 15_000);
});
