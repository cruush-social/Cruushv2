import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { deleteAccountSupportData } from "./account-deletion-support.js";
import type { DbClient, DbQueryResult } from "./db.js";

const databaseUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const ownerId = "cd000000-0000-4000-8000-000000000001";
const otherId = "cd000000-0000-4000-8000-000000000002";
const ownRequestId = "cd000000-0000-4000-8000-000000000101";
const otherRequestId = "cd000000-0000-4000-8000-000000000102";

function dbFor(client: pg.Client): DbClient {
  return {
    query<T>(sql: string, values?: unknown[]) {
      return client.query(sql, values) as unknown as Promise<DbQueryResult<T>>;
    },
    end: async () => undefined,
  };
}

async function fixture() {
  const url = new URL(databaseUrl!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)
      || !/^\/cruush_account_deletion_integrity(?:_[a-z0-9]+)*$/.test(url.pathname)) {
    throw new Error("Use a disposable local account-deletion database.");
  }
  const schema = `support_delete_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: databaseUrl });
  const writer = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await writer.connect();
  await client.query(`create schema ${schema}`);
  await client.query(`set search_path = ${schema}`);
  await writer.query(`set search_path = ${schema}`);
  await client.query(`
    create table app_users (id uuid primary key);
    create table support_requests (
      id uuid primary key, requester_user_id uuid references app_users(id) on delete set null,
      message text not null
    );
    create table support_request_replies (
      id uuid primary key, support_request_id uuid references support_requests(id) on delete cascade,
      message text not null
    );
    create table suspension_appeal_evidence (
      id uuid primary key, support_request_id uuid references support_requests(id) on delete cascade,
      object_key text unique not null, encrypted_data_key text not null
    );
    create table account_deletion_media_cleanup (object_key text primary key);
    create table reports (id uuid primary key, target_user_id uuid references app_users(id) on delete set null, details text);
    create table csam_incidents (id uuid primary key, user_id uuid references app_users(id) on delete set null, evidence_reference text);
  `);
  await client.query("insert into app_users values ($1), ($2)", [ownerId, otherId]);
  await client.query("insert into support_requests values ($1, $3, 'Delete my private support text'), ($2, $4, 'Keep other support text')",
    [ownRequestId, otherRequestId, ownerId, otherId]);
  return {
    client, writer, db: dbFor(client),
    async close() {
      await Promise.allSettled([client.query("rollback"), writer.query("rollback")]);
      await writer.end();
      await client.query(`drop schema ${schema} cascade`);
      await client.end();
    },
  };
}

describe.skipIf(!databaseUrl)("ordinary support removal during account deletion", () => {
  it("removes only the deleted account's support text, replies and appeal keys while retaining cleanup and formal evidence", async () => {
    const { client, db, close } = await fixture();
    try {
      await client.query("insert into support_request_replies values ($1, $3, 'Delete my reply'), ($2, $4, 'Keep other reply')",
        ["cd000000-0000-4000-8000-000000000201", "cd000000-0000-4000-8000-000000000202", ownRequestId, otherRequestId]);
      await client.query("insert into suspension_appeal_evidence values ($1, $3, 'owner-id.enc', 'owner-id-key'), ($2, $4, 'other-id.enc', 'other-id-key')",
        ["cd000000-0000-4000-8000-000000000301", "cd000000-0000-4000-8000-000000000302", ownRequestId, otherRequestId]);
      await client.query("insert into reports values ($1, $2, 'Formal safety report')", [ownerId, ownerId]);
      await client.query("insert into csam_incidents values ($1, $2, 'Separate preserved evidence')", [ownerId, ownerId]);
      await client.query("begin");
      await client.query("select id from app_users where id = $1 for update", [ownerId]);
      expect(await deleteAccountSupportData(db, ownerId)).toEqual(["owner-id.enc"]);
      await client.query("delete from app_users where id = $1", [ownerId]);
      await client.query("commit");

      expect((await client.query("select message from support_requests")).rows).toEqual([{ message: "Keep other support text" }]);
      expect((await client.query("select message from support_request_replies")).rows).toEqual([{ message: "Keep other reply" }]);
      expect((await client.query("select object_key, encrypted_data_key from suspension_appeal_evidence")).rows)
        .toEqual([{ object_key: "other-id.enc", encrypted_data_key: "other-id-key" }]);
      expect((await client.query("select object_key from account_deletion_media_cleanup")).rows).toEqual([{ object_key: "owner-id.enc" }]);
      expect((await client.query("select target_user_id, details from reports")).rows)
        .toEqual([{ target_user_id: null, details: "Formal safety report" }]);
      expect((await client.query("select user_id, evidence_reference from csam_incidents")).rows)
        .toEqual([{ user_id: null, evidence_reference: "Separate preserved evidence" }]);
    } finally { await close(); }
  });

  it("queues appeal evidence committed while deletion waits for the support request lock", async () => {
    const { client, writer, db, close } = await fixture();
    let deletion: Promise<string[]> | undefined;
    try {
      await writer.query("begin");
      await writer.query("select id from support_requests where id = $1 for key share", [ownRequestId]);
      await client.query("begin");
      await client.query("select id from app_users where id = $1 for update", [ownerId]);
      let parentLockStarted!: () => void;
      const parentLock = new Promise<void>((resolve) => { parentLockStarted = resolve; });
      const observed: DbClient = {
        ...db,
        query<T>(sql: string, values?: unknown[]) {
          if (sql.includes("select id from support_requests")) parentLockStarted();
          return db.query<T>(sql, values);
        },
      };
      deletion = deleteAccountSupportData(observed, ownerId);
      await parentLock;
      await writer.query("insert into suspension_appeal_evidence values ($1, $2, 'concurrent-selfie.enc', 'concurrent-private-key')",
        ["cd000000-0000-4000-8000-000000000303", ownRequestId]);
      await writer.query("commit");
      expect(await deletion).toEqual(["concurrent-selfie.enc"]);
      await client.query("delete from app_users where id = $1", [ownerId]);
      await client.query("commit");
      expect((await client.query("select object_key from account_deletion_media_cleanup")).rows)
        .toEqual([{ object_key: "concurrent-selfie.enc" }]);
      expect((await client.query("select count(*)::int as total from suspension_appeal_evidence")).rows)
        .toEqual([{ total: 0 }]);
    } finally {
      await writer.query("rollback");
      await deletion?.catch(() => undefined);
      await close();
    }
  });
});
