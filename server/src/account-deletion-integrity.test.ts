import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import { hashPassword, hashSessionToken, SESSION_COOKIE_NAME } from "./auth.js";
import { loadConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";

const realPostgresUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const { Pool } = pg;
const origin = "http://localhost:5173";
const password = "account-deletion-integrity-password";

const supportUserId = "10000000-0000-4000-8000-000000000001";
const supportRequestWithoutEmailId = "10000000-0000-4000-8000-000000000101";
const supportRequestWithEmailId = "10000000-0000-4000-8000-000000000102";
const supportReplyId = "10000000-0000-4000-8000-000000000201";
const supportReplyAfterDeletionId = "10000000-0000-4000-8000-000000000202";
const supportSessionToken = "account-deletion-support-session-token";

const reportTargetUserId = "20000000-0000-4000-8000-000000000001";
const reporterUserId = "30000000-0000-4000-8000-000000000001";
const reportSessionToken = "account-deletion-report-session-token";
const reportIds = [
  "20000000-0000-4000-8000-000000000101",
  "20000000-0000-4000-8000-000000000102",
  "20000000-0000-4000-8000-000000000103",
  "20000000-0000-4000-8000-000000000104",
  "20000000-0000-4000-8000-000000000105"
];
const postId = "40000000-0000-4000-8000-000000000001";
const conversationId = "50000000-0000-4000-8000-000000000001";
const messageId = "60000000-0000-4000-8000-000000000001";
const profilePhotoMediaObjectId = "65000000-0000-4000-8000-000000000001";
const profilePhotoObjectKey = "account-deletion-integrity/profile-photo.jpg";

const concurrentUserAId = "80000000-0000-4000-8000-000000000001";
const concurrentUserBId = "80000000-0000-4000-8000-000000000002";
const concurrentUserAToken = "account-deletion-concurrent-session-a";
const concurrentUserBToken = "account-deletion-concurrent-session-b";
const concurrentReportIds = [
  "80000000-0000-4000-8000-000000000101",
  "80000000-0000-4000-8000-000000000102"
];
const accountDeletionBarrierLockId = 760076;
const reportUpdateBarrierLockId = 760077;

const replyRaceUserId = "90000000-0000-4000-8000-000000000001";
const replyRaceSupportRequestId = "90000000-0000-4000-8000-000000000101";
const replyRaceReplyId = "90000000-0000-4000-8000-000000000201";
const replyRaceSessionToken = "account-deletion-reply-race-session";
const supportUpdateBarrierLockId = 760078;

const replyInsertRaceUserId = "a0000000-0000-4000-8000-000000000001";
const replyInsertRaceSupportRequestId = "a0000000-0000-4000-8000-000000000101";
const replyInsertRaceReplyId = "a0000000-0000-4000-8000-000000000201";
const replyInsertRaceSessionToken = "account-deletion-reply-insert-race-session";

const contentRaceUserId = "b0000000-0000-4000-8000-000000000001";
const contentRaceReporterId = "b0000000-0000-4000-8000-000000000002";
const contentRacePostId = "b0000000-0000-4000-8000-000000000101";
const contentRaceReportId = "b0000000-0000-4000-8000-000000000201";
const contentRaceSessionToken = "account-deletion-content-race-session";
const contentDeleteBarrierLockId = 760079;
const contentReportUpdateBarrierLockId = 760080;

const deadlockRetryUserId = "c0000000-0000-4000-8000-000000000001";
const deadlockRetrySupportRequestId = "c0000000-0000-4000-8000-000000000101";
const deadlockRetrySessionToken = "account-deletion-deadlock-retry-session";

const persistentDeadlockUserId = "d0000000-0000-4000-8000-000000000001";
const persistentDeadlockSupportRequestId = "d0000000-0000-4000-8000-000000000101";
const persistentDeadlockSessionToken = "account-deletion-persistent-deadlock-session";

describe.skipIf(!realPostgresUrl)("account deletion integrity with real PostgreSQL", () => {
  let db: DbClient;
  let app: ReturnType<typeof buildServer>;

  async function deleteFixtures() {
    await db.query("drop trigger if exists aaa_account_deletion_test_barrier on app_users");
    await db.query("drop trigger if exists aaa_report_update_test_barrier on reports");
    await db.query("drop trigger if exists zzz_support_update_test_barrier on support_requests");
    await db.query("drop trigger if exists aaa_post_delete_test_barrier on posts");
    await db.query("drop trigger if exists aaa_content_report_update_test_barrier on reports");
    await db.query("drop trigger if exists zzz_account_deletion_deadlock_test on app_users");
    await db.query("drop function if exists account_deletion_integrity_test_barrier()");
    await db.query("drop function if exists account_deletion_report_update_test_barrier()");
    await db.query("drop function if exists account_deletion_support_update_test_barrier()");
    await db.query("drop function if exists account_deletion_post_delete_test_barrier()");
    await db.query("drop function if exists account_deletion_content_report_update_test_barrier()");
    await db.query("drop function if exists account_deletion_deadlock_test()");
    await db.query("drop sequence if exists account_deletion_deadlock_test_sequence");
    await db.query("delete from reports where id = any($1::uuid[])", [concurrentReportIds]);
    await db.query("delete from reports where id = $1::uuid", [contentRaceReportId]);
    await db.query(
      "delete from rate_limit_buckets where bucket_key = any($1::text[])",
      [[
        `account-delete:user:${supportUserId}`,
        `account-delete:user:${reportTargetUserId}`,
        `account-delete:user:${concurrentUserAId}`,
        `account-delete:user:${concurrentUserBId}`,
        `account-delete:user:${replyRaceUserId}`,
        `account-delete:user:${replyInsertRaceUserId}`,
        `account-delete:user:${contentRaceUserId}`,
        `account-delete:user:${deadlockRetryUserId}`,
        `account-delete:user:${persistentDeadlockUserId}`
      ]]
    );
    await db.query("delete from reports where id = any($1::uuid[])", [reportIds]);
    await db.query(
      `delete from support_requests
       where id in ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid)`,
      [
        supportRequestWithoutEmailId,
        supportRequestWithEmailId,
        replyRaceSupportRequestId,
        replyInsertRaceSupportRequestId,
        deadlockRetrySupportRequestId,
        persistentDeadlockSupportRequestId
      ]
    );
    await db.query("delete from conversations where id = $1::uuid", [conversationId]);
    await db.query("delete from posts where id = $1::uuid", [postId]);
    await db.query("delete from media_objects where id = $1::uuid", [profilePhotoMediaObjectId]);
    await db.query(
      "delete from account_deletion_media_cleanup where object_key = $1",
      [profilePhotoObjectKey]
    );
    await db.query(
      `delete from app_users
       where id in (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
         $8::uuid, $9::uuid, $10::uuid, $11::uuid
       )`,
      [
        supportUserId,
        reportTargetUserId,
        reporterUserId,
        concurrentUserAId,
        concurrentUserBId,
        replyRaceUserId,
        replyInsertRaceUserId,
        contentRaceUserId,
        contentRaceReporterId,
        deadlockRetryUserId,
        persistentDeadlockUserId
      ]
    );
  }

  async function insertUserWithSession(input: {
    id: string;
    email: string;
    sessionToken: string;
  }) {
    const passwordHash = await hashPassword(password);

    await db.query(
      `insert into app_users (id, email, password_hash)
       values ($1::uuid, $2, $3)`,
      [input.id, input.email, passwordHash]
    );
    await db.query(
      `insert into app_sessions (user_id, token_hash, expires_at)
       values ($1::uuid, $2, now() + interval '1 day')`,
      [input.id, hashSessionToken(input.sessionToken)]
    );
  }

  function requestAccountDeletion(sessionToken: string) {
    return app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      headers: {
        origin,
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`
      },
      payload: {
        password,
        confirmation: "DELETE"
      }
    });
  }

  async function deleteAccount(userId: string, sessionToken: string) {
    const response = await requestAccountDeletion(sessionToken);

    expect(response.statusCode).toBe(204);
    expect(response.headers["set-cookie"]).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");

    const persisted = await db.query<{ user_count: string; session_count: string }>(
      `select
         (select count(*) from app_users where id = $1::uuid)::text as user_count,
         (select count(*) from app_sessions where user_id = $1::uuid)::text as session_count`,
      [userId]
    );
    expect(persisted.rows[0]).toEqual({ user_count: "0", session_count: "0" });

    const staleCookie = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        origin,
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`
      }
    });
    expect(staleCookie.statusCode).toBe(401);
  }

  beforeAll(async () => {
    if (!realPostgresUrl) {
      return;
    }

    const databaseName = decodeURIComponent(
      new URL(realPostgresUrl).pathname.split("/").filter(Boolean).pop() ?? ""
    );
    if (!/^cruush_account_deletion_integrity(?:_[a-z0-9]+)*$/.test(databaseName)) {
      throw new Error(
        `CRUUSH_REAL_POSTGRES_URL must name a disposable account-deletion database; received ${databaseName || "an empty database name"}.`
      );
    }

    const config = loadConfig({
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: realPostgresUrl,
      SESSION_SECRET: process.env.SESSION_SECRET ?? "account-deletion-integrity-test",
      CORS_ORIGIN: origin
    });
    db = createPool(config);
    app = buildServer(config, { db });
    await app.ready();
    await deleteFixtures();
  });

  afterEach(async () => {
    if (db) {
      await deleteFixtures();
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("deletes an account with its ordinary support requests and replies", async () => {
    await insertUserWithSession({
      id: supportUserId,
      email: "account-deletion-support@example.test",
      sessionToken: supportSessionToken
    });
    await db.query(
      `insert into support_requests (
         id, requester_user_id, contact_email, category, subject, message,
         source, page_url, status, created_at, updated_at
       )
       values
         ($1::uuid, $3::uuid, null, 'bug', 'Deletion blocker', 'Keep this support evidence.',
          'settings', '/settings', 'open', timestamptz '2026-08-10 12:00:00+00', timestamptz '2026-08-10 12:01:00+00'),
         ($2::uuid, $3::uuid, 'account-deletion-support@example.test', 'question', 'Deletion follow-up',
          'Keep this second support record.', 'settings', '/settings', 'in_progress',
          timestamptz '2026-08-10 12:02:00+00', timestamptz '2026-08-10 12:03:00+00')`,
      [supportRequestWithoutEmailId, supportRequestWithEmailId, supportUserId]
    );
    await db.query(
      `insert into support_request_replies (
         id, support_request_id, recipient_email, subject, message, delivery_status, created_at
       )
       values ($1::uuid, $2::uuid, 'account-deletion-support@example.test',
               'Preserved reply', 'Keep this support reply.', 'sent',
               timestamptz '2026-08-10 12:04:00+00')`,
      [supportReplyId, supportRequestWithEmailId]
    );

    await deleteAccount(supportUserId, supportSessionToken);

    const requests = await db.query("select id from support_requests where id = any($1::uuid[])",
      [[supportRequestWithoutEmailId, supportRequestWithEmailId]]);
    expect(requests.rows).toEqual([]);
    expect((await db.query("select id from support_request_replies where id = $1", [supportReplyId])).rows).toEqual([]);
    await expect(db.query(
      `insert into support_request_replies (id, support_request_id, recipient_email, subject, message, delivery_status)
       values ($1, $2, 'must-not-survive@example.test', 'Deleted request', 'Cannot recreate reply.', 'pending')`,
      [supportReplyAfterDeletionId, supportRequestWithEmailId]
    )).rejects.toMatchObject({ code: "23503" });
    expect((await db.query("update support_requests set contact_email = 'must-not-return@example.test' where id = $1 returning id",
      [supportRequestWithoutEmailId])).rows).toEqual([]);
  });

  it("deletes a reported account while retaining anonymized report evidence", async () => {
    await insertUserWithSession({
      id: reportTargetUserId,
      email: "account-deletion-report-target@example.test",
      sessionToken: reportSessionToken
    });
    await db.query(
      `insert into app_users (id, email, password_hash)
       values ($1::uuid, 'account-deletion-reporter@example.test', 'unused-test-password-hash')`,
      [reporterUserId]
    );
    await db.query(
      `insert into profiles (id, display_name)
       values ($1::uuid, 'Deletion report target')`,
      [reportTargetUserId]
    );
    await db.query(
      `insert into posts (id, user_id, content, expires_in, expires_at)
       values ($1::uuid, $2::uuid, 'Preserved report target', 'never', timestamptz '9999-12-31 23:59:59+00')`,
      [postId, reportTargetUserId]
    );
    await db.query(
      `insert into conversations (id, kind, created_by)
       values ($1::uuid, 'dm', $2::uuid)`,
      [conversationId, reportTargetUserId]
    );
    await db.query(
      `insert into conversation_members (conversation_id, user_id)
       values ($1::uuid, $2::uuid), ($1::uuid, $3::uuid)`,
      [conversationId, reportTargetUserId, reporterUserId]
    );
    await db.query(
      `insert into messages (id, conversation_id, user_id, content)
       values ($1::uuid, $2::uuid, $3::uuid, 'Preserved message report target')`,
      [messageId, conversationId, reportTargetUserId]
    );
    await db.query(
      `insert into media_objects (
         id, owner_user_id, surface, object_key, public_url, media_type, mime_type,
         byte_size, encrypted_data_key, data_key_nonce, data_key_auth_tag,
         content_nonce, content_auth_tag, key_version, moderation_status
       )
       values (
         $1::uuid, $2::uuid, 'profile_photo', $3,
         'https://media.example.test/private/deleted-account-photo.jpg',
         'image', 'image/jpeg', 1, 'test-key', 'test-data-nonce', 'test-data-tag',
         'test-content-nonce', 'test-content-tag', 'v1', 'approved'
       )`,
      [profilePhotoMediaObjectId, reportTargetUserId, profilePhotoObjectKey]
    );
    await db.query(
      `insert into reports (
         id, reporter_user_id, target_type, target_user_id, conversation_id,
         message_id, post_id, media_object_id, profile_photo_url, reason, details, status,
         created_at, updated_at
       )
       values
         ($1::uuid, $6::uuid, 'user', $7::uuid, null, null, null, null, null,
          'harassment', 'Preserve user report.', 'open',
          timestamptz '2026-08-10 13:00:00+00', timestamptz '2026-08-10 13:01:00+00'),
         ($2::uuid, $6::uuid, 'profile', $7::uuid, null, null, null, null, null,
          'impersonation', 'Preserve profile report.', 'resolved',
          timestamptz '2026-08-10 13:02:00+00', timestamptz '2026-08-10 13:03:00+00'),
         ($3::uuid, $6::uuid, 'post', null, null, null, $8::uuid, null, null,
          'hate', 'Preserve post report.', 'dismissed',
          timestamptz '2026-08-10 13:04:00+00', timestamptz '2026-08-10 13:05:00+00'),
         ($4::uuid, $6::uuid, 'message', null, $9::uuid, $10::uuid, null, null, null,
          'violence_threat', 'Preserve message report.', 'automod_processing',
          timestamptz '2026-08-10 13:06:00+00', timestamptz '2026-08-10 13:07:00+00'),
         ($5::uuid, $6::uuid, 'profile_photo', $7::uuid, null, null, null, $11::uuid,
          'https://media.example.test/private/deleted-account-photo.jpg', 'privacy_location',
          'Preserve photo report.', 'open',
          timestamptz '2026-08-10 13:08:00+00', timestamptz '2026-08-10 13:09:00+00')`,
      [
        ...reportIds,
        reporterUserId,
        reportTargetUserId,
        postId,
        conversationId,
        messageId,
        profilePhotoMediaObjectId
      ]
    );

    await deleteAccount(reportTargetUserId, reportSessionToken);

    const reports = await db.query<{
      id: string;
      target_type: string;
      target_user_id: string | null;
      target_account_deleted_at: string | Date | null;
      conversation_id: string | null;
      message_id: string | null;
      post_id: string | null;
      media_object_id: string | null;
      profile_photo_url: string | null;
      reason: string;
      details: string;
      status: string;
      created_at: string | Date;
      updated_at: string | Date;
    }>(
      `select id::text, target_type, target_user_id::text, target_account_deleted_at,
              conversation_id::text, message_id::text, post_id::text, media_object_id::text,
              profile_photo_url,
              reason, details, status, created_at, updated_at
       from reports
       where id = any($1::uuid[])
       order by id`,
      [reportIds]
    );

    expect(reports.rows).toHaveLength(5);
    expect(reports.rows.every((row) => row.target_user_id === null)).toBe(true);
    expect(reports.rows.every((row) => row.target_account_deleted_at !== null)).toBe(true);
    expect(reports.rows.find((row) => row.target_type === "post")?.post_id).toBeNull();
    expect(reports.rows.find((row) => row.target_type === "message")?.message_id).toBeNull();
    expect(reports.rows.find((row) => row.target_type === "message")?.conversation_id).toBe(conversationId);
    expect(reports.rows.find((row) => row.target_type === "profile_photo")?.media_object_id).toBeNull();
    expect(reports.rows.find((row) => row.target_type === "profile_photo")?.profile_photo_url).toBeNull();
    expect(reports.rows.map((row) => ({
      type: row.target_type,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    }))).toEqual([
      { type: "user", reason: "harassment", details: "Preserve user report.", status: "open", createdAt: "2026-08-10T13:00:00.000Z", updatedAt: "2026-08-10T13:01:00.000Z" },
      { type: "profile", reason: "impersonation", details: "Preserve profile report.", status: "resolved", createdAt: "2026-08-10T13:02:00.000Z", updatedAt: "2026-08-10T13:03:00.000Z" },
      { type: "post", reason: "hate", details: "Preserve post report.", status: "dismissed", createdAt: "2026-08-10T13:04:00.000Z", updatedAt: "2026-08-10T13:05:00.000Z" },
      { type: "message", reason: "violence_threat", details: "Preserve message report.", status: "automod_processing", createdAt: "2026-08-10T13:06:00.000Z", updatedAt: "2026-08-10T13:07:00.000Z" },
      { type: "profile_photo", reason: "privacy_location", details: "Preserve photo report.", status: "open", createdAt: "2026-08-10T13:08:00.000Z", updatedAt: "2026-08-10T13:09:00.000Z" }
    ]);

    await expect(db.query(
      `update reports
       set target_user_id = $2::uuid
       where id = $1::uuid`,
      [reportIds[0], reporterUserId]
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("serializes mutually reported account deletions without a report-row deadlock", async () => {
    if (!realPostgresUrl) {
      return;
    }

    await insertUserWithSession({
      id: concurrentUserAId,
      email: "account-deletion-concurrent-a@example.test",
      sessionToken: concurrentUserAToken
    });
    await insertUserWithSession({
      id: concurrentUserBId,
      email: "account-deletion-concurrent-b@example.test",
      sessionToken: concurrentUserBToken
    });
    await db.query(
      `insert into reports (
         id, reporter_user_id, target_type, target_user_id, reason, details
       )
       values
         ($1::uuid, $3::uuid, 'user', $4::uuid, 'harassment', 'A reported B.'),
         ($2::uuid, $4::uuid, 'user', $3::uuid, 'harassment', 'B reported A.')`,
      [
        concurrentReportIds[0],
        concurrentReportIds[1],
        concurrentUserAId,
        concurrentUserBId
      ]
    );
    await db.query(
      `create or replace function account_deletion_integrity_test_barrier()
       returns trigger
       language plpgsql
       as $body$
       begin
         perform pg_advisory_xact_lock_shared(${accountDeletionBarrierLockId});
         return old;
       end;
       $body$`
    );
    await db.query(
      `create trigger aaa_account_deletion_test_barrier
       before delete on app_users
       for each row
       when (old.id in ('${concurrentUserAId}'::uuid, '${concurrentUserBId}'::uuid))
       execute function account_deletion_integrity_test_barrier()`
    );
    await db.query(
      `create or replace function account_deletion_report_update_test_barrier()
       returns trigger
       language plpgsql
       as $body$
       begin
         perform pg_advisory_xact_lock_shared(${reportUpdateBarrierLockId});
         return new;
       end;
       $body$`
    );
    await db.query(
      `create trigger aaa_report_update_test_barrier
       before update on reports
       for each row
       when (old.id in ('${concurrentReportIds[0]}'::uuid, '${concurrentReportIds[1]}'::uuid))
       execute function account_deletion_report_update_test_barrier()`
    );

    const controlPool = new Pool({ connectionString: realPostgresUrl, max: 1 });
    const control = await controlPool.connect();
    let deletionRequests: Array<ReturnType<typeof requestAccountDeletion>> = [];

    try {
      await control.query("select pg_advisory_lock($1)", [accountDeletionBarrierLockId]);
      await control.query("select pg_advisory_lock($1)", [reportUpdateBarrierLockId]);
      deletionRequests = [
        requestAccountDeletion(concurrentUserAToken),
        requestAccountDeletion(concurrentUserBToken)
      ];
      let waitingDeletions = 0;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await control.query<{ count: string }>(
          `select count(*)::text as count
           from pg_stat_activity
           where datname = current_database()
             and wait_event = 'advisory'
             and query like 'delete from app_users%'`
        );
        waitingDeletions = Number(waiting.rows[0]?.count ?? 0);

        if (waitingDeletions >= 2) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(waitingDeletions).toBe(2);
      await control.query("select pg_advisory_unlock($1)", [accountDeletionBarrierLockId]);

      let reportPhaseWaiting = 0;
      let reportPhaseAdvisory = 0;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await control.query<{
          advisory_count: string;
          waiting_count: string;
        }>(
          `select
             count(*) filter (where wait_event = 'advisory')::text as advisory_count,
             count(*) filter (where wait_event is not null)::text as waiting_count
           from pg_stat_activity
           where datname = current_database()
             and query like 'delete from app_users%'`
        );
        reportPhaseAdvisory = Number(waiting.rows[0]?.advisory_count ?? 0);
        reportPhaseWaiting = Number(waiting.rows[0]?.waiting_count ?? 0);

        if (reportPhaseWaiting >= 2 && reportPhaseAdvisory >= 1) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(reportPhaseWaiting).toBe(2);
      expect(reportPhaseAdvisory).toBeGreaterThanOrEqual(1);
      await control.query("select pg_advisory_unlock($1)", [reportUpdateBarrierLockId]);

      const responses = await Promise.all(deletionRequests);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([204, 204]);

      const persisted = await db.query<{ user_count: string; session_count: string }>(
        `select
           (select count(*) from app_users where id in ($1::uuid, $2::uuid))::text as user_count,
           (select count(*) from app_sessions where user_id in ($1::uuid, $2::uuid))::text as session_count`,
        [concurrentUserAId, concurrentUserBId]
      );
      expect(persisted.rows[0]).toEqual({ user_count: "0", session_count: "0" });
    } finally {
      await control.query("select pg_advisory_unlock($1)", [accountDeletionBarrierLockId]);
      await control.query("select pg_advisory_unlock($1)", [reportUpdateBarrierLockId]);
      await Promise.allSettled(deletionRequests);
      control.release();
      await controlPool.end();
    }
  }, 15_000);

  it("keeps account deletion ahead of a concurrent support-reply address update", async () => {
    if (!realPostgresUrl) {
      return;
    }

    await insertUserWithSession({
      id: replyRaceUserId,
      email: "account-deletion-reply-race@example.test",
      sessionToken: replyRaceSessionToken
    });
    await db.query(
      `insert into support_requests (
         id, requester_user_id, contact_email, category, subject, message, source, page_url
       )
       values ($1::uuid, $2::uuid, null, 'question', 'Reply race',
               'Preserve this request.', 'settings', '/settings')`,
      [replyRaceSupportRequestId, replyRaceUserId]
    );
    await db.query(
      `insert into support_request_replies (
         id, support_request_id, recipient_email, subject, message, delivery_status
       )
       values ($1::uuid, $2::uuid, 'account-deletion-reply-race@example.test',
               'Reply race', 'Preserve this reply.', 'sent')`,
      [replyRaceReplyId, replyRaceSupportRequestId]
    );
    await db.query(
      `create or replace function account_deletion_support_update_test_barrier()
       returns trigger
       language plpgsql
       as $body$
       begin
         perform pg_advisory_xact_lock_shared(${supportUpdateBarrierLockId});
         return old;
       end;
       $body$`
    );
    await db.query(
      `create trigger zzz_support_update_test_barrier
       before delete on support_requests
       for each row
       when (old.requester_user_id is not null)
       execute function account_deletion_support_update_test_barrier()`
    );

    const controlPool = new Pool({ connectionString: realPostgresUrl, max: 1 });
    const replyPool = new Pool({ connectionString: realPostgresUrl, max: 1 });
    const control = await controlPool.connect();
    let deletionRequest: ReturnType<typeof requestAccountDeletion> | null = null;
    let replyUpdate: Promise<unknown> | null = null;

    try {
      await control.query("select pg_advisory_lock($1)", [supportUpdateBarrierLockId]);
      deletionRequest = requestAccountDeletion(replyRaceSessionToken);
      let deletionWaiting = false;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await control.query<{ count: string }>(
          `select count(*)::text as count
           from pg_stat_activity
           where datname = current_database()
             and wait_event = 'advisory'
             and position('support_request' in lower(query)) > 0`
        );
        deletionWaiting = Number(waiting.rows[0]?.count ?? 0) >= 1;

        if (deletionWaiting) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(deletionWaiting).toBe(true);
      replyUpdate = replyPool.query(
        `update support_request_replies
         set recipient_email = 'must-not-return@example.test'
         where id = $1::uuid`,
        [replyRaceReplyId]
      );
      void replyUpdate.catch(() => undefined);
      let replyUpdateWaiting = false;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await control.query<{ count: string }>(
          `select count(*)::text as count
           from pg_stat_activity
           where datname = current_database()
             and wait_event is not null
             and position('update support_request_replies' in lower(query)) > 0`
        );
        replyUpdateWaiting = Number(waiting.rows[0]?.count ?? 0) >= 1;

        if (replyUpdateWaiting) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(replyUpdateWaiting).toBe(true);
      await control.query("select pg_advisory_unlock($1)", [supportUpdateBarrierLockId]);
      const [deletionOutcome, replyOutcome] = await Promise.allSettled([
        deletionRequest,
        replyUpdate
      ]);

      expect(deletionOutcome.status).toBe("fulfilled");
      if (deletionOutcome.status === "fulfilled") {
        expect(deletionOutcome.value.statusCode).toBe(204);
      }
      if (replyOutcome.status === "rejected") {
        expect(replyOutcome.reason).toMatchObject({ code: "23514" });
      }

      const reply = await db.query<{ recipient_email: string }>(
        `select recipient_email
         from support_request_replies
         where id = $1::uuid`,
        [replyRaceReplyId]
      );
      expect(reply.rows).toEqual([]);
    } finally {
      await control.query("select pg_advisory_unlock($1)", [supportUpdateBarrierLockId]);
      await Promise.allSettled([
        ...(deletionRequest ? [deletionRequest] : []),
        ...(replyUpdate ? [replyUpdate] : [])
      ]);
      control.release();
      await Promise.all([controlPool.end(), replyPool.end()]);
    }
  }, 15_000);

  it("deletes a support reply committed while account deletion waits", async () => {
    if (!realPostgresUrl) {
      return;
    }

    await insertUserWithSession({
      id: replyInsertRaceUserId,
      email: "account-deletion-reply-insert-race@example.test",
      sessionToken: replyInsertRaceSessionToken
    });
    await db.query(
      `insert into support_requests (
         id, requester_user_id, contact_email, category, subject, message, source, page_url
       )
       values ($1::uuid, $2::uuid, null, 'question', 'Reply insert race',
               'Preserve this request.', 'settings', '/settings')`,
      [replyInsertRaceSupportRequestId, replyInsertRaceUserId]
    );

    const replyPool = new Pool({ connectionString: realPostgresUrl, max: 1 });
    const replyClient = await replyPool.connect();
    let deletionRequest: ReturnType<typeof requestAccountDeletion> | null = null;
    let replyCommitted = false;

    try {
      await replyClient.query("begin");
      await replyClient.query(
        `insert into support_request_replies (
           id, support_request_id, recipient_email, subject, message, delivery_status
         )
         values ($1::uuid, $2::uuid, 'account-deletion-reply-insert-race@example.test',
                 'Reply insert race', 'Preserve this concurrent reply.', 'sent')`,
        [replyInsertRaceReplyId, replyInsertRaceSupportRequestId]
      );

      deletionRequest = requestAccountDeletion(replyInsertRaceSessionToken);
      let deletionWaiting = false;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await db.query<{ count: string }>(
          `select count(*)::text as count
           from pg_stat_activity
           where datname = current_database()
             and wait_event is not null
             and position('support_request' in lower(query)) > 0`
        );
        deletionWaiting = Number(waiting.rows[0]?.count ?? 0) >= 1;

        if (deletionWaiting) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(deletionWaiting).toBe(true);
      await replyClient.query("commit");
      replyCommitted = true;

      const deletion = await deletionRequest;
      expect(deletion.statusCode).toBe(204);

      const reply = await db.query<{ recipient_email: string }>(
        `select recipient_email
         from support_request_replies
         where id = $1::uuid`,
        [replyInsertRaceReplyId]
      );
      expect(reply.rows).toEqual([]);
    } finally {
      if (!replyCommitted) {
        await replyClient.query("rollback");
      }
      if (deletionRequest) {
        await Promise.allSettled([deletionRequest]);
      }
      replyClient.release();
      await replyPool.end();
    }
  }, 15_000);

  it("completes account deletion through an in-flight reported-content deadlock", async () => {
    if (!realPostgresUrl) {
      return;
    }

    await insertUserWithSession({
      id: contentRaceUserId,
      email: "account-deletion-content-race@example.test",
      sessionToken: contentRaceSessionToken
    });
    await db.query(
      `insert into app_users (id, email, password_hash)
       values ($1::uuid, 'account-deletion-content-race-reporter@example.test',
               'unused-test-password-hash')`,
      [contentRaceReporterId]
    );
    await db.query(
      `insert into profiles (id, display_name)
       values ($1::uuid, 'Content race target')`,
      [contentRaceUserId]
    );
    await db.query(
      `insert into posts (id, user_id, content, expires_in, expires_at)
       values ($1::uuid, $2::uuid, 'Reported content race', 'never',
               timestamptz '9999-12-31 23:59:59+00')`,
      [contentRacePostId, contentRaceUserId]
    );
    await db.query(
      `insert into reports (
         id, reporter_user_id, target_type, target_user_id, post_id, reason, details
       )
       values ($1::uuid, $2::uuid, 'post', $3::uuid, $4::uuid,
               'harassment', 'Preserve the content report.')`,
      [contentRaceReportId, contentRaceReporterId, contentRaceUserId, contentRacePostId]
    );
    await db.query(
      `create or replace function account_deletion_post_delete_test_barrier()
       returns trigger
       language plpgsql
       as $body$
       begin
         perform pg_advisory_xact_lock_shared(${contentDeleteBarrierLockId});
         return old;
       end;
       $body$`
    );
    await db.query(
      `create trigger aaa_post_delete_test_barrier
       before delete on posts
       for each row
       execute function account_deletion_post_delete_test_barrier()`
    );
    await db.query(
      `create or replace function account_deletion_content_report_update_test_barrier()
       returns trigger
       language plpgsql
       as $body$
       begin
         if new.id = '${contentRaceReportId}'::uuid then
           perform pg_advisory_xact_lock_shared(${contentReportUpdateBarrierLockId});
         end if;
         return new;
       end;
       $body$`
    );
    await db.query(
      `create trigger aaa_content_report_update_test_barrier
       after update on reports
       for each row
       execute function account_deletion_content_report_update_test_barrier()`
    );

    const controlPool = new Pool({ connectionString: realPostgresUrl, max: 1 });
    const contentPool = new Pool({ connectionString: realPostgresUrl, max: 1 });
    const control = await controlPool.connect();
    let contentDeletion: Promise<unknown> | null = null;
    let accountDeletion: ReturnType<typeof requestAccountDeletion> | null = null;

    try {
      await control.query("select pg_advisory_lock($1)", [contentDeleteBarrierLockId]);
      await control.query("select pg_advisory_lock($1)", [contentReportUpdateBarrierLockId]);
      const startedContentDeletion = contentPool.query(
        "delete from posts where id = $1::uuid",
        [contentRacePostId]
      );
      contentDeletion = startedContentDeletion;
      void startedContentDeletion.catch(() => undefined);
      let contentWaiting = false;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await control.query<{ count: string }>(
          `select count(*)::text as count
           from pg_stat_activity
           where datname = current_database()
             and wait_event = 'advisory'
             and query like 'delete from posts%'`
        );
        contentWaiting = Number(waiting.rows[0]?.count ?? 0) >= 1;

        if (contentWaiting) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(contentWaiting).toBe(true);
      accountDeletion = requestAccountDeletion(contentRaceSessionToken);
      let accountWaiting = false;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await control.query<{ count: string }>(
          `select count(*)::text as count
           from pg_stat_activity
           where datname = current_database()
             and wait_event is not null
             and query like 'delete from app_users%'`
        );
        accountWaiting = Number(waiting.rows[0]?.count ?? 0) >= 1;

        if (accountWaiting) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(accountWaiting).toBe(true);
      const prematureReportUpdate = await control.query<{ count: string }>(
        `select count(*)::text as count
         from pg_stat_activity
         where datname = current_database()
           and wait_event = 'advisory'
           and query like 'delete from app_users%'`
      );
      expect(Number(prematureReportUpdate.rows[0]?.count ?? 0)).toBe(1);
      await control.query("select pg_advisory_unlock($1)", [contentDeleteBarrierLockId]);

      let reportUpdateWaiting = false;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const waiting = await control.query<{ count: string }>(
          `select count(*)::text as count
           from pg_stat_activity
           where datname = current_database()
             and wait_event = 'advisory'
             and query like 'delete from app_users%'`
        );
        reportUpdateWaiting = Number(waiting.rows[0]?.count ?? 0) >= 1;

        if (reportUpdateWaiting) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(reportUpdateWaiting).toBe(true);
      await control.query("select pg_advisory_unlock($1)", [contentReportUpdateBarrierLockId]);

      const [contentOutcome, accountOutcome] = await Promise.allSettled([
        contentDeletion,
        accountDeletion
      ]);
      expect(contentOutcome.status).toBe("rejected");
      if (contentOutcome.status === "rejected") {
        expect(["23514", "40P01"]).toContain(contentOutcome.reason?.code);
      }
      expect(accountOutcome.status).toBe("fulfilled");
      if (accountOutcome.status === "fulfilled") {
        expect(accountOutcome.value.statusCode).toBe(204);
      }
    } finally {
      await control.query("select pg_advisory_unlock($1)", [contentDeleteBarrierLockId]);
      await control.query("select pg_advisory_unlock($1)", [contentReportUpdateBarrierLockId]);
      await Promise.allSettled([
        ...(contentDeletion ? [contentDeletion] : []),
        ...(accountDeletion ? [accountDeletion] : [])
      ]);
      control.release();
      await Promise.all([controlPool.end(), contentPool.end()]);
    }
  }, 15_000);

  it("retries account deletion after PostgreSQL aborts a deadlocked transaction", async () => {
    if (!realPostgresUrl) {
      return;
    }

    await insertUserWithSession({
      id: deadlockRetryUserId,
      email: "account-deletion-deadlock-retry@example.test",
      sessionToken: deadlockRetrySessionToken
    });
    await db.query(
      `insert into support_requests (
         id, requester_user_id, contact_email, category, subject, message, source, page_url
       )
       values ($1::uuid, $2::uuid, null, 'bug', 'Deadlock retry',
               'The retained row must survive the retried transaction.', 'settings', '/settings')`,
      [deadlockRetrySupportRequestId, deadlockRetryUserId]
    );
    await db.query("create sequence account_deletion_deadlock_test_sequence");
    await db.query(
      `create or replace function account_deletion_deadlock_test()
       returns trigger
       language plpgsql
       as $body$
       begin
         if old.id = '${deadlockRetryUserId}'::uuid and
            nextval('account_deletion_deadlock_test_sequence') = 1 then
           raise exception using
             errcode = '40P01',
             message = 'Forced account-deletion deadlock for retry coverage.';
         end if;
         return old;
       end;
       $body$`
    );
    await db.query(
      `create trigger zzz_account_deletion_deadlock_test
       before delete on app_users
       for each row
       execute function account_deletion_deadlock_test()`
    );

    const deletion = await requestAccountDeletion(deadlockRetrySessionToken);
    expect(deletion.statusCode).toBe(204);

    const persisted = await db.query<{
      sequence_value: string;
      user_count: string;
      session_count: string;
      support_count: string;
      support_anonymized: boolean;
    }>(
      `select
         (select last_value::text from account_deletion_deadlock_test_sequence) as sequence_value,
         (select count(*)::text from app_users where id = $1::uuid) as user_count,
         (select count(*)::text from app_sessions where user_id = $1::uuid) as session_count,
         (select count(*)::text from support_requests where id = $2::uuid) as support_count,
         (select requester_user_id is null and requester_account_deleted_at is not null
          from support_requests where id = $2::uuid) as support_anonymized`,
      [deadlockRetryUserId, deadlockRetrySupportRequestId]
    );
    expect(persisted.rows[0]).toEqual({
      sequence_value: "2",
      user_count: "0",
      session_count: "0",
      support_count: "0",
      support_anonymized: null
    });
  });

  it("stops after two deadlocked account-deletion transactions without partial deletion", async () => {
    if (!realPostgresUrl) {
      return;
    }

    await insertUserWithSession({
      id: persistentDeadlockUserId,
      email: "account-deletion-persistent-deadlock@example.test",
      sessionToken: persistentDeadlockSessionToken
    });
    await db.query(
      `insert into support_requests (
         id, requester_user_id, contact_email, category, subject, message, source, page_url
       )
       values ($1::uuid, $2::uuid, null, 'bug', 'Persistent deadlock',
               'No partial deletion may commit.', 'settings', '/settings')`,
      [persistentDeadlockSupportRequestId, persistentDeadlockUserId]
    );
    await db.query("create sequence account_deletion_deadlock_test_sequence");
    await db.query(
      `create or replace function account_deletion_deadlock_test()
       returns trigger
       language plpgsql
       as $body$
       begin
         if old.id = '${persistentDeadlockUserId}'::uuid then
           perform nextval('account_deletion_deadlock_test_sequence');
           raise exception using
             errcode = '40P01',
             message = 'Forced persistent account-deletion deadlock.';
         end if;
         return old;
       end;
       $body$`
    );
    await db.query(
      `create trigger zzz_account_deletion_deadlock_test
       before delete on app_users
       for each row
       execute function account_deletion_deadlock_test()`
    );

    const deletion = await requestAccountDeletion(persistentDeadlockSessionToken);
    expect(deletion.statusCode).toBe(500);

    const persisted = await db.query<{
      sequence_value: string;
      user_count: string;
      session_count: string;
      support_count: string;
      support_active: boolean;
    }>(
      `select
         (select last_value::text from account_deletion_deadlock_test_sequence) as sequence_value,
         (select count(*)::text from app_users where id = $1::uuid) as user_count,
         (select count(*)::text from app_sessions where user_id = $1::uuid) as session_count,
         (select count(*)::text from support_requests where id = $2::uuid) as support_count,
         (select requester_user_id = $1::uuid and requester_account_deleted_at is null
          from support_requests where id = $2::uuid) as support_active`,
      [persistentDeadlockUserId, persistentDeadlockSupportRequestId]
    );
    expect(persisted.rows[0]).toEqual({
      sequence_value: "2",
      user_count: "1",
      session_count: "1",
      support_count: "1",
      support_active: true
    });
  });
});
