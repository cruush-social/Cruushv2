import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbClient, DbQueryResult } from "./db.js";
import { reverseRewardGrant } from "./rewards-service.js";

const databaseUrl = process.env.CRUUSH_ACCOUNT_REWARD_PRIVACY_POSTGRES_URL;
const owner = "ef000000-0000-4000-8000-000000000001";
const other = "ef000000-0000-4000-8000-000000000002";
const absent = "ef000000-0000-4000-8000-000000000003";
const grants = [
  "ef000000-0000-4000-8000-000000000101",
  "ef000000-0000-4000-8000-000000000102",
  "ef000000-0000-4000-8000-000000000103"
];

describe.skipIf(!databaseUrl)("account deletion reward privacy with PostgreSQL", () => {
  let client: pg.Client;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/cruush_account_reward_privacy_")) {
      throw new Error("Use a disposable local reward privacy database.");
    }
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    // Roll back both the migration and fixtures after testing its real triggers.
    await client.query("begin");
    await client.query("insert into app_users (id, email, password_hash) values ($1, 'reward-private@example.test', 'fixture'), ($2, 'reward-other@example.test', 'fixture')", [owner, other]);
    for (const [index, user] of [owner, other, absent].entries()) {
      await client.query(`insert into reward_grants (id, user_id, source, days,
        idempotency_key, milestone_key, audit_metadata)
        values ($1, $2, 'admin', 3, $3, $4, $5::jsonb)`,
      [grants[index], user, `private-grant:${user}`, `milestone:${user}`,
        JSON.stringify({ email: "private@example.test", userId: user,
          ...(user === other ? { referredUserId: owner } : {}) })]);
    }
    await client.query(`insert into reward_grant_reversals (grant_id, user_id, days, reason, audit_metadata)
      values ($1, $2, 1, 'A private support explanation.', '{"email":"private@example.test"}')`, [grants[0], owner]);
    await client.query(await readFile(new URL("../sql/228_account_deletion_reward_privacy.sql", import.meta.url), "utf8"));
  });

  afterAll(async () => {
    if (client) {
      await client.query("rollback");
      await client.end();
    }
  });

  async function expectRejected(sql: string, values: unknown[], code?: string) {
    await client.query("savepoint rejected_write");
    try {
      const assertion = expect(client.query(sql, values));
      if (code) await assertion.rejects.toMatchObject({ code });
      else await assertion.rejects.toThrow("append-only");
    } finally {
      await client.query("rollback to savepoint rejected_write");
      await client.query("release savepoint rejected_write");
    }
  }

  it("repairs previously deleted owners without changing another member's ledger", async () => {
    expect((await client.query("select user_id, audit_metadata, idempotency_key, milestone_key, days from reward_grants where id=$1", [grants[2]])).rows[0])
      .toEqual({ user_id: null, audit_metadata: {}, idempotency_key: `account-deleted:${grants[2]}`, milestone_key: null, days: 3 });
    expect((await client.query("select user_id, audit_metadata, idempotency_key, days from reward_grants where id=$1", [grants[1]])).rows[0])
      .toEqual({ user_id: other, audit_metadata: { email: "private@example.test", userId: other, referredUserId: owner }, idempotency_key: `private-grant:${other}`, days: 3 });
  });

  it("keeps ordinary mutations and direct redaction of an active member forbidden", async () => {
    await expectRejected("update reward_grants set days=4 where id=$1", [grants[0]]);
    await expectRejected("delete from reward_grants where id=$1", [grants[1]]);
    await expectRejected(`update reward_grants set user_id=null, audit_metadata='{}',
      idempotency_key='account-deleted:'||id::text, milestone_key=null, referral_id=null where id=$1`, [grants[0]]);
  });

  it("removes identifiers while preserving grant and reversal accounting on deletion", async () => {
    const before = (await client.query("select days, source, created_at from reward_grants where id=$1", [grants[0]])).rows[0];
    await client.query("delete from app_users where id=$1", [owner]);
    expect((await client.query("select user_id, audit_metadata, idempotency_key, milestone_key, referral_id, days, source, created_at from reward_grants where id=$1", [grants[0]])).rows[0])
      .toEqual({ ...before, user_id: null, audit_metadata: {}, idempotency_key: `account-deleted:${grants[0]}`, milestone_key: null, referral_id: null });
    expect((await client.query("select user_id, audit_metadata, reason, days, grant_id from reward_grant_reversals where grant_id=$1", [grants[0]])).rows[0])
      .toEqual({ user_id: null, audit_metadata: {}, reason: "Account deleted", days: 1, grant_id: grants[0] });
    expect((await client.query("select user_id, audit_metadata, idempotency_key, days from reward_grants where id=$1", [grants[1]])).rows[0])
      .toEqual({ user_id: other, audit_metadata: { email: "private@example.test", userId: other }, idempotency_key: `private-grant:${other}`, days: 3 });
    await expectRejected("insert into reward_grants (user_id, source, days, idempotency_key) values ($1, 'admin', 1, 'late-recreated-link')", [owner], "23503");
    await expectRejected("update reward_grants set days=4 where id=$1", [grants[0]]);
  });

  it("does not recreate promotional access by reversing a detached historical grant", async () => {
    const db: DbClient = {
      query<T>(sql: string, values?: unknown[]) {
        return client.query(sql, values) as unknown as Promise<DbQueryResult<T>>;
      },
      end: async () => undefined,
      async transaction<T>(fn: (tx: DbClient) => Promise<T>) {
        await client.query("savepoint detached_reversal");
        try {
          const result = await fn(db);
          await client.query("release savepoint detached_reversal");
          return result;
        } catch (error) {
          await client.query("rollback to savepoint detached_reversal");
          await client.query("release savepoint detached_reversal");
          throw error;
        }
      }
    };
    await expect(reverseRewardGrant({ db }, { grantId: grants[0], reason: "Attempted after deletion" }))
      .rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    expect((await client.query("select count(*)::int as count from promotional_cruush_plus_entitlements where user_id=$1", [owner])).rows[0].count).toBe(0);
  });
});
