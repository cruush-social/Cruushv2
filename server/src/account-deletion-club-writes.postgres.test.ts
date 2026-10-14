import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { admitLockedClubMember } from "./club-admission.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";

vi.mock("./encrypted-club-enrollments.js", async (original) => ({
  ...await original<typeof import("./encrypted-club-enrollments.js")>(),
  findClubEnrollment: async () => null,
  upsertClubEnrollment: async () => undefined,
  deleteClubEnrollment: async () => undefined,
}));

const databaseUrl = process.env.CRUUSH_REAL_POSTGRES_URL;
const userId = "ce000000-0000-4000-8000-000000000001";
const clubId = "ce000000-0000-4000-8000-000000000101";
const conversationId = "ce000000-0000-4000-8000-000000000201";
const config = {
  SESSION_SECRET: "opaque-membership-deletion-fixture",
  CLUB_ENROLLMENT_INDEX_KEY: "opaque-membership-index-fixture",
  CLUB_ENROLLMENT_INDEX_KEY_VERSION: "v1",
} as AppConfig;

// Execute the statement emitted by the actual admission writer, rather than a
// parallel copy of its SQL. Its opaque values must remain safe after a stale
// writer has already loaded the account and deletion wins the row lock.
async function admissionWrite() {
  const query = vi.fn(async (sql: string, _params: unknown[] = []) => ({
    rows: sql.includes("as account_status") ? [{ account_status: "active" }]
      : sql.includes("as member_count") ? [{ member_count: 0, already_member: false }] : [],
  }));
  await admitLockedClubMember({
    config, db: { query: query as DbClient["query"], end: async () => undefined },
    club: { id: clubId, conversation_id: conversationId, requires_join_approval: false, closed_at: null },
  }, userId);
  const write = query.mock.calls.find(([sql]) => sql.includes("insert into conversation_members"));
  if (!write) throw new Error("Admission did not issue its conversation membership write.");
  return { sql: write[0], params: write[1] };
}

describe.skipIf(!databaseUrl)("opaque Coven membership deletion race", () => {
  it("waits for account deletion and inserts no opaque row once deletion commits", async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname)
        || !/^\/cruush_account_deletion_integrity(?:_[a-z0-9]+)*$/.test(url.pathname)) {
      throw new Error("Use a disposable local account-deletion database.");
    }
    const schema = `club_delete_${randomUUID().replaceAll("-", "")}`;
    const deletion = new pg.Client({ connectionString: databaseUrl });
    const writer = new pg.Client({ connectionString: databaseUrl });
    let pending: Promise<pg.QueryResult> | undefined;
    try {
      await deletion.connect();
      await writer.connect();
      await deletion.query(`create schema ${schema}`);
      await deletion.query(`set search_path = ${schema}`);
      await writer.query(`set search_path = ${schema}`);
      await deletion.query(`
        create table app_users (id uuid primary key);
        create table conversation_members (
          conversation_id uuid not null, user_id uuid, member_index text,
          role text not null, last_read_at timestamptz
        );
        create unique index opaque_member on conversation_members (conversation_id, member_index)
          where member_index is not null;
      `);
      await deletion.query("insert into app_users values ($1)", [userId]);
      const statement = await admissionWrite();
      const writerPid = (await writer.query("select pg_backend_pid() as pid")).rows[0].pid;
      await deletion.query("begin");
      await deletion.query("delete from app_users where id = $1", [userId]);
      pending = writer.query(statement.sql, statement.params);
      // Observe the real row-lock wait before releasing deletion's transaction.
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        blocked = (await deletion.query("select wait_event_type = 'Lock' as blocked from pg_stat_activity where pid = $1", [writerPid])).rows[0]?.blocked === true;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await deletion.query("commit");
      expect((await pending).rowCount).toBe(0);
      expect((await writer.query("select count(*)::int as total from conversation_members")).rows)
        .toEqual([{ total: 0 }]);
    } finally {
      await deletion.query("rollback").catch(() => undefined);
      await pending?.catch(() => undefined);
      await writer.end();
      await deletion.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
      await deletion.end();
    }
  });
});
