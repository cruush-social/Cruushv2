import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshPushSubscription, upsertPushSubscription } from "./push-service.js";

const databaseUrl = process.env.CRUUSH_PUSH_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("background push refresh in PostgreSQL", () => {
  let pool: Pool;
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const schema = `push_refresh_${randomUUID().replaceAll("-", "")}`;
  const subscription = { endpoint: "https://push.example/device", keys: { p256dh: "key", auth: "auth" } };
  const appWith = (db: Pool | PoolClient) => ({ db } as unknown as Parameters<typeof refreshPushSubscription>[0]);

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/cruush_push_refresh_test_[a-z0-9_]+$/.test(url.pathname)) {
      throw new Error("Use an isolated local push-refresh test database.");
    }
    pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`create schema ${schema}`);
    await pool.query(`
      create table notification_preferences (
        user_id uuid primary key, email_enabled boolean not null default true,
        push_enabled boolean not null default false, cruush_enabled boolean not null default true,
        messages_enabled boolean not null default true, groups_enabled boolean not null default true,
        nearby_enabled boolean not null default true, mutual_feed_enabled boolean not null default true,
        rewards_enabled boolean not null default true, site_reminders_enabled boolean not null default true,
        sound_enabled boolean not null default true, quiet_hours_enabled boolean not null default false,
        quiet_hours_start_minute integer not null default 0, quiet_hours_end_minute integer not null default 360,
        quiet_hours_timezone text not null default 'UTC', pulse_enabled boolean not null default true,
        updated_at timestamptz not null default now()
      );
      create table push_subscriptions (
        id uuid primary key default gen_random_uuid(), user_id uuid not null,
        endpoint text not null unique, p256dh text not null, auth text not null, user_agent text not null default '',
        revoked_at timestamptz, updated_at timestamptz not null default now()
      );
    `);
  });

  beforeEach(async () => {
    await pool.query("delete from push_subscriptions; delete from notification_preferences");
  });

  afterAll(async () => {
    await pool?.query(`drop schema if exists ${schema} cascade`);
    await pool?.end();
  });

  const setPreference = (enabled: boolean, id = userId) => pool.query(
    "insert into notification_preferences(user_id,push_enabled,sound_enabled) values($1,$2,false)", [id, enabled]
  );
  const subscriptionCount = async () => (await pool.query("select count(*)::integer as count from push_subscriptions")).rows[0].count;

  it("does not create preferences or a subscription for an account without opt-in", async () => {
    expect(await refreshPushSubscription(appWith(pool), userId, subscription)).toMatchObject({ pushEnabled: false });
    expect(await subscriptionCount()).toBe(0);
    expect((await pool.query("select count(*)::integer as count from notification_preferences")).rows[0].count).toBe(0);
  });

  it("leaves paused preferences and subscription state untouched", async () => {
    await setPreference(false);
    expect(await refreshPushSubscription(appWith(pool), userId, subscription)).toMatchObject({ pushEnabled: false, soundEnabled: false });
    expect(await subscriptionCount()).toBe(0);
  });

  it("repairs an opted-in account's own subscription without changing preferences", async () => {
    await setPreference(true);
    expect(await refreshPushSubscription(appWith(pool), userId, subscription, "first")).toMatchObject({ pushEnabled: true, soundEnabled: false });
    await pool.query("update push_subscriptions set revoked_at=now()");
    await refreshPushSubscription(appWith(pool), userId, { ...subscription, keys: { p256dh: "new-key", auth: "new-auth" } }, "second");
    expect((await pool.query("select user_id,p256dh,auth,user_agent,revoked_at from push_subscriptions")).rows).toEqual([
      { user_id: userId, p256dh: "new-key", auth: "new-auth", user_agent: "second", revoked_at: null }
    ]);
    expect(await subscriptionCount()).toBe(1);
  });

  it("never transfers another account's endpoint or enables a disabled account", async () => {
    await setPreference(true, otherUserId);
    await refreshPushSubscription(appWith(pool), otherUserId, subscription, "original");
    await setPreference(true);
    await refreshPushSubscription(appWith(pool), userId, { ...subscription, keys: { p256dh: "replacement", auth: "replacement" } }, "new");
    await pool.query("update notification_preferences set push_enabled=false where user_id=$1", [userId]);
    expect(await refreshPushSubscription(appWith(pool), userId, subscription)).toMatchObject({ pushEnabled: false });
    expect((await pool.query("select user_id,p256dh,auth,user_agent from push_subscriptions")).rows).toEqual([
      { user_id: otherUserId, p256dh: "key", auth: "auth", user_agent: "original" }
    ]);
  });

  it("preserves explicit Enable's opt-in and endpoint-transfer behavior", async () => {
    await setPreference(true, otherUserId);
    await refreshPushSubscription(appWith(pool), otherUserId, subscription);
    await setPreference(false);
    expect(await upsertPushSubscription(appWith(pool), userId, subscription)).toMatchObject({ pushEnabled: true });
    expect((await pool.query("select user_id from push_subscriptions")).rows).toEqual([{ user_id: userId }]);
  });

  it("waits for an in-flight Pause and does not register afterward", async () => {
    await setPreference(true);
    const pause = await pool.connect();
    const refresh = await pool.connect();
    try {
      const pid = (await refresh.query("select pg_backend_pid() as pid")).rows[0].pid;
      await pause.query("begin");
      await pause.query("update notification_preferences set push_enabled=false where user_id=$1", [userId]);
      const pendingRefresh = refreshPushSubscription(appWith(refresh), userId, subscription);
      await vi.waitFor(async () => {
        const row = (await pool.query("select cardinality(pg_blocking_pids($1)) as blockers", [pid])).rows[0];
        expect(row.blockers).toBeGreaterThan(0);
      });
      await pause.query("commit");
      expect(await pendingRefresh).toMatchObject({ pushEnabled: false });
      expect(await subscriptionCount()).toBe(0);
    } finally {
      await pause.query("rollback");
      pause.release();
      refresh.release();
    }
  });

  it("lets a concurrent Pause win after a refresh already holding the preference lock", async () => {
    await setPreference(true);
    const refresh = await pool.connect();
    const pause = await pool.connect();
    try {
      const pid = (await pause.query("select pg_backend_pid() as pid")).rows[0].pid;
      await refresh.query("begin");
      await refreshPushSubscription(appWith(refresh), userId, subscription);
      const pendingPause = pause.query("update notification_preferences set push_enabled=false where user_id=$1", [userId]);
      await vi.waitFor(async () => {
        const row = (await pool.query("select cardinality(pg_blocking_pids($1)) as blockers", [pid])).rows[0];
        expect(row.blockers).toBeGreaterThan(0);
      });
      await refresh.query("commit");
      await pendingPause;
      expect((await pool.query("select push_enabled from notification_preferences where user_id=$1", [userId])).rows[0].push_enabled).toBe(false);
      expect(await subscriptionCount()).toBe(1);
    } finally {
      await refresh.query("rollback");
      refresh.release();
      pause.release();
    }
  });

  it("can finish a background refresh while explicit Enable waits for its preference lock", async () => {
    await setPreference(true);
    await refreshPushSubscription(appWith(pool), userId, subscription);
    const refresh = await pool.connect();
    const enable = await pool.connect();
    try {
      const pid = (await enable.query("select pg_backend_pid() as pid")).rows[0].pid;
      await refresh.query("begin");
      await refresh.query("select user_id from notification_preferences where user_id=$1 for update", [userId]);
      const pendingEnable = upsertPushSubscription(appWith(enable), userId, subscription)
        .then(() => null, (error: { code?: string }) => error.code);
      await vi.waitFor(async () => {
        const row = (await pool.query("select cardinality(pg_blocking_pids($1)) as blockers", [pid])).rows[0];
        expect(row.blockers).toBeGreaterThan(0);
      });
      const refreshError = await refreshPushSubscription(appWith(refresh), userId, subscription)
        .then(() => null, (error: { code?: string }) => error.code);
      await refresh.query(refreshError ? "rollback" : "commit");
      expect([refreshError, await pendingEnable]).toEqual([null, null]);
    } finally {
      await refresh.query("rollback");
      refresh.release();
      enable.release();
    }
  });
});
