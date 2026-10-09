import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import {
  MAP_PING_RETENTION_DAYS,
  cleanupExpiredMapPings,
  startMapPingCleanupScheduler
} from "./map-ping-cleanup.js";

function cleanupDb(pingIds: string[]): DbClient & { queries: Array<{ sql: string; params: unknown[] }> } {
  const queries: Array<{ sql: string; params: unknown[] }> = [];

  return {
    queries,
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });

      if (/^(begin|commit|rollback)$/i.test(sql.trim())) {
        return { rows: [] as T[] };
      }

      if (sql.includes("from map_pings") && sql.includes("for update skip locked")) {
        return { rows: pingIds.map((id) => ({ id })) as T[] };
      }

      if (sql.includes("delete from map_pings")) {
        return { rows: pingIds.map((id) => ({ id })) as T[] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
    async end() {
      return undefined;
    }
  };
}

describe("map Ping cleanup", () => {
  it("deletes seven-day-old Pings without owning feed expiry", async () => {
    const db = cleanupDb(["10000000-0000-4000-8000-000000000001"]);

    await expect(cleanupExpiredMapPings(db, 25)).resolves.toEqual({ pings: 1 });

    expect(db.queries[1]?.sql).toContain("expires_at <= now() - ($1::integer * interval '1 day')");
    expect(db.queries[1]?.params).toEqual([MAP_PING_RETENTION_DAYS, 25]);
    expect(db.queries[2]?.sql).toContain("delete from map_pings");
    expect(db.queries.some(({ sql }) => sql.includes("app_notifications"))).toBe(false);
  });

  it("does not issue deletes when no retained Pings are due", async () => {
    const db = cleanupDb([]);

    await expect(cleanupExpiredMapPings(db)).resolves.toEqual({ pings: 0 });
    expect(db.queries.some(({ sql }) => sql.includes("delete from"))).toBe(false);
  });

  it("runs immediately and reports scheduler failures without crashing", async () => {
    const error = new Error("database unavailable");
    const app = {
      db: {
        query: vi.fn().mockRejectedValue(error),
        end: vi.fn()
      },
      log: {
        info: vi.fn(),
        error: vi.fn()
      }
    } as never;

    const stop = startMapPingCleanupScheduler(app, 60_000);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect((app as { log: { error: ReturnType<typeof vi.fn> } }).log.error).toHaveBeenCalledWith(
      { err: error },
      "scheduled map Ping retention cleanup failed"
    );
    stop();
  });
});
