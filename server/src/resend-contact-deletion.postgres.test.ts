import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";

const databaseUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const userId = "cf000000-0000-4000-8000-000000000001";
const newUserId = "cf000000-0000-4000-8000-000000000002";
const email = "resend-erasure-fixture@example.test";
const config = {
  APP_DEPLOYMENT_STAGE: "production", SESSION_SECRET: "resend-erasure-fixture-secret-only",
  MEDIA_ENCRYPTION_KEY_VERSION: "v1", RESEND_API_KEY: "synthetic-provider-key",
  RESEND_CRUUSH_APP_AUDIENCE_ID: "synthetic-member-audience",
} as AppConfig;

let api: typeof import("./resend-contact-deletion.js");
let sync: typeof import("./resend-audience.js").syncVerifiedMemberToResendAudience;
beforeEach(async () => {
  vi.resetModules();
  api = await import("./resend-contact-deletion.js");
  ({ syncVerifiedMemberToResendAudience: sync } = await import("./resend-audience.js"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fixture() {
  const url = new URL(databaseUrl!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)
      || !/^\/cruush_account_deletion_integrity(?:_[a-z0-9]+)*$/.test(url.pathname)) {
    throw new Error("Use a disposable local account-deletion database.");
  }
  const schema = `resend_delete_${randomUUID().replaceAll("-", "")}`;
  const control = new pg.Client({ connectionString: databaseUrl });
  await control.connect();
  await control.query(`create schema ${schema}`);
  await control.query(`set search_path = ${schema}`);
  await control.query(`create table app_users (
    id uuid primary key, email text not null unique, email_verified_at timestamptz,
    account_status text default 'active'
  )`);
  await control.query(await readFile(new URL("../sql/230_resend_contact_deletion_outbox.sql", import.meta.url), "utf8"));
  await control.query("insert into app_users(id,email,email_verified_at) values ($1,$2,now())", [userId, email]);
  url.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=10000`);
  url.searchParams.set("application_name", schema);
  const db = createPool({ DATABASE_URL: url.toString() });
  const logger = { warn: vi.fn(), error: vi.fn() };
  const app = { db, config, log: logger };
  const deleteAccount = () => db.transaction(async (tx: DbClient) => {
    await tx.query("select id from app_users where id=$1 for update", [userId]);
    const jobId = await api.queueResendContactDeletion({ db: tx, config, userId, email });
    await tx.query("delete from app_users where id=$1", [userId]);
    return jobId!;
  });
  return {
    db, control, app, logger, schema, deleteAccount,
    async close() {
      await db.end();
      await control.query(`drop schema ${schema} cascade`);
      await control.end();
    },
  };
}

describe.skipIf(!databaseUrl)("Resend account-contact erasure with PostgreSQL", () => {
  it("skips unconfigured local providers and unverifiable target addresses", async () => {
    const { db, app, close } = await fixture();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await api.queueResendContactDeletion({ db, config: { ...config, APP_DEPLOYMENT_STAGE: "staging" }, userId, email })).toBeNull();
      expect(await api.queueResendContactDeletion({ db, config, userId, email: "someone-else@example.test" })).toBeNull();
      await db.query("update app_users set email_verified_at=null where id=$1", [userId]);
      expect(await api.queueResendContactDeletion({ db, config, userId, email })).toBeNull();
      expect(await api.cleanupResendContactDeletions({ ...app, config: { ...config, RESEND_API_KEY: "" } }))
        .toEqual({ completed: 0, superseded: 0, pending: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await db.query("select count(*)::int as total from resend_contact_deletion_outbox")).rows).toEqual([{ total: 0 }]);
    } finally { await close(); }
  });

  it("treats provider 404 as complete and erases all encrypted target material", async () => {
    const { db, app, deleteAccount, close } = await fixture();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 })); vi.stubGlobal("fetch", fetchMock);
    try {
      const id = await deleteAccount();
      const pending = (await db.query("select * from resend_contact_deletion_outbox where id=$1", [id])).rows[0];
      expect(JSON.stringify(pending)).not.toContain(email);
      expect(JSON.stringify(pending)).not.toContain(userId);
      expect(await api.cleanupResendContactDeletions(app, { ids: [id] })).toEqual({ completed: 1, superseded: 0, pending: 0 });
      expect(fetchMock).toHaveBeenCalledWith(`https://api.resend.com/contacts/${encodeURIComponent(email)}`,
        expect.objectContaining({ method: "DELETE" }));
      const done = (await db.query("select status, payload_ciphertext, encrypted_data_key, key_version from resend_contact_deletion_outbox where id=$1", [id])).rows[0];
      expect(done).toEqual({ status: "completed", payload_ciphertext: null, encrypted_data_key: null, key_version: null });
    } finally { await close(); }
  });

  it("keeps an encrypted production cleanup target during a credential outage", async () => {
    const { db, app, close } = await fixture();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    try {
      const unavailable = { ...config, RESEND_API_KEY: "" };
      const id = await db.transaction(async (tx) => {
        await tx.query("select id from app_users where id=$1 for update", [userId]);
        const queued = await api.queueResendContactDeletion({ db: tx, config: unavailable, userId, email });
        await tx.query("delete from app_users where id=$1", [userId]);
        return queued!;
      });
      expect(await api.cleanupResendContactDeletions({ ...app, config: unavailable }, { ids: [id] }))
        .toEqual({ completed: 0, superseded: 0, pending: 1 });
      const queued = (await db.query("select status, payload_ciphertext from resend_contact_deletion_outbox where id=$1", [id])).rows[0];
      expect(queued.status).toBe("pending");
      expect(queued.payload_ciphertext).toBeTruthy();
      expect(JSON.stringify(queued)).not.toContain(email);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await close(); }
  });

  it("bounds the immediate attempt even while its database claim waits", async () => {
    const { db, app, deleteAccount, close } = await fixture();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    let releaseClaim!: () => void;
    const pause = new Promise<void>((resolve) => { releaseClaim = resolve; });
    try {
      const id = await deleteAccount();
      const delayed: DbClient = {
        ...db,
        async query<T>(sql: string, values?: unknown[]) {
          if (sql.includes("with candidates as")) await pause;
          return db.query<T>(sql, values);
        },
      };
      expect(await api.cleanupResendContactDeletions({ ...app, db: delayed }, { ids: [id], timeoutMs: 25 }))
        .toEqual({ completed: 0, superseded: 0, pending: 1 });
      releaseClaim();
      let finished = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const row = (await db.query("select attempt_count, lease_until from resend_contact_deletion_outbox where id=$1", [id])).rows[0];
        finished = row.attempt_count === 1 && row.lease_until === null;
        if (finished) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(finished).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await db.query("select count(*)::int as total from app_users")).rows).toEqual([{ total: 0 }]);
    } finally { releaseClaim(); await close(); }
  });

  it("retains only encrypted retry targets after failure and completes a later retry without restoring the account", async () => {
    const { db, app, logger, deleteAccount, close } = await fixture();
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error(`request failed ${email} ${config.RESEND_API_KEY}`))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: "contact", contact: "fixture-contact", deleted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const id = await deleteAccount();
      expect(await api.cleanupResendContactDeletions(app, { ids: [id] })).toEqual({ completed: 0, superseded: 0, pending: 1 });
      const queued = (await db.query("select * from resend_contact_deletion_outbox where id=$1", [id])).rows[0];
      expect(queued.status).toBe("pending");
      expect(queued.last_error_code).toBe("provider_request_failed");
      expect(JSON.stringify(queued)).not.toMatch(/resend-erasure-fixture@example|synthetic-provider-key/);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(email);
      await db.query("update resend_contact_deletion_outbox set next_attempt_at=now() where id=$1", [id]);
      expect(await api.cleanupResendContactDeletions(app, { ids: [id] })).toEqual({ completed: 1, superseded: 0, pending: 0 });
      expect((await db.query("select count(*)::int as total from app_users")).rows).toEqual([{ total: 0 }]);
      expect((await db.query("select status, payload_ciphertext from resend_contact_deletion_outbox where id=$1", [id])).rows)
        .toEqual([{ status: "completed", payload_ciphertext: null }]);
    } finally { await close(); }
  });

  it("does not accept a successful HTTP response without deletion confirmation", async () => {
    const { db, app, deleteAccount, close } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ deleted: false }), { status: 200 })));
    try {
      const id = await deleteAccount();
      expect(await api.cleanupResendContactDeletions(app, { ids: [id] })).toEqual({ completed: 0, superseded: 0, pending: 1 });
      expect((await db.query("select status, last_error_code from resend_contact_deletion_outbox where id=$1", [id])).rows)
        .toEqual([{ status: "pending", last_error_code: "provider_result_unconfirmed" }]);
    } finally { await close(); }
  });

  it("prevents an existing queued contact create from recreating the contact after account deletion", async () => {
    const { db, control, app, logger, schema, deleteAccount, close } = await fixture();
    let releaseLookup!: () => void;
    let lookupStarted!: () => void;
    const started = new Promise<void>((resolve) => { lookupStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseLookup = resolve; });
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      methods.push(init.method ?? "GET");
      if (!init.method) { lookupStarted(); await release; return new Response(null, { status: 404 }); }
      return new Response(JSON.stringify({ deleted: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let syncing: Promise<unknown> | undefined;
    let deletion: Promise<string> | undefined;
    try {
      syncing = sync({ config, db, email, logger });
      await started;
      deletion = deleteAccount();
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        blocked = (await control.query(`select exists(select 1 from pg_stat_activity
          where application_name=$1 and wait_event_type='Lock' and query like '%app_users%for update%') as blocked`, [schema])).rows[0].blocked;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      releaseLookup();
      const id = await deletion;
      expect(await syncing).toBe("skipped");
      expect(await api.cleanupResendContactDeletions(app, { ids: [id] })).toEqual({ completed: 1, superseded: 0, pending: 0 });
      expect(methods).toEqual(["GET", "DELETE"]);
      expect((await db.query("select count(*)::int as total from app_users")).rows).toEqual([{ total: 0 }]);
    } finally {
      releaseLookup();
      await Promise.allSettled([syncing, deletion]);
      await close();
    }
  });

  it("marks stale cleanup superseded without deleting a later verified account's contact", async () => {
    const { db, app, deleteAccount, close } = await fixture();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    try {
      const id = await deleteAccount();
      await db.query("insert into app_users(id,email,email_verified_at) values ($1,$2,now())", [newUserId, email]);
      expect(await api.cleanupResendContactDeletions(app, { ids: [id] })).toEqual({ completed: 0, superseded: 1, pending: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await db.query("select status, payload_ciphertext, encrypted_data_key from resend_contact_deletion_outbox where id=$1", [id])).rows)
        .toEqual([{ status: "superseded", payload_ciphertext: null, encrypted_data_key: null }]);
      expect((await db.query("select id from app_users")).rows).toEqual([{ id: newUserId }]);
    } finally { await close(); }
  });
});
