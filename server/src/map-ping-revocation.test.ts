import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import type { VisibilityPolicyPayload } from "./location-privacy.js";
import type { ProfileVisibilityRules } from "./profile-sensitive.js";
import {
  mapVisibilityNarrowed,
  profileVisibilityNarrowed,
  revokeActiveMapPings
} from "./map-ping-revocation.js";

const userId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-09T20:00:00.000Z");

const publicProfileRules: ProfileVisibilityRules = {
  active_crowd_modes: [],
  age_range: null,
  distance: null,
  identities: [],
  presentations: [],
  looking_for: [],
  timing: [],
  hosting: [],
  vibes: [],
  crowds: [],
  hobbies: [],
  positions: [],
  roles: [],
  kinks: [],
  body_types: [],
  sexuality: [],
  substance_boundaries: []
};

function mapPolicy(input: Partial<VisibilityPolicyPayload> = {}): VisibilityPolicyPayload {
  return {
    version: 1,
    subjectUserId: userId,
    policyVersion: 1,
    baseMode: "PUBLIC_PRECISE",
    ghostRadiusMeters: 1609,
    preciseToMutualCruushes: false,
    preciseToMutualCrowds: [],
    auditRequired: false,
    updatedAtMs: now.getTime(),
    expiresAtMs: null,
    keyVersion: "v1",
    ...input
  };
}

describe("map Ping privacy revocation", () => {
  it("expires active Pings while retaining tombstones", async () => {
    const pingIds = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002"
    ];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from app_users") && sql.includes("for update")) {
        return { rows: [{ id: userId }] };
      }

      if (sql.includes("from map_pings") && sql.includes("for update")) {
        return { rows: pingIds.map((id) => ({ id })) };
      }

      if (sql.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: now.toISOString() }] };
      }

      if (sql.includes("update map_pings")) {
        return { rows: pingIds.map((id) => ({ id })) };
      }

      throw new Error(`Unexpected query: ${sql} ${JSON.stringify(params)}`);
    });
    const transaction = vi.fn(async <T>(operation: (client: DbClient) => Promise<T>) => operation({
      query: query as unknown as DbClient["query"],
      end: vi.fn()
    } as DbClient));
    const db = {
      query,
      transaction,
      end: vi.fn()
    } as unknown as DbClient;

    await expect(revokeActiveMapPings(db, userId)).resolves.toEqual({ pings: 2 });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0]?.[0]).toContain("from app_users");
    expect(query.mock.calls[0]?.[0]).toContain("for update");
    expect(query.mock.calls[0]?.[1]).toEqual([userId]);
    expect(query.mock.calls[1]?.[0]).toContain("from map_pings");
    expect(query.mock.calls[1]?.[0]).toContain("for update");
    expect(query.mock.calls[2]?.[0]).toContain("clock_timestamp()");
    expect(query.mock.calls[3]?.[0]).toContain("update map_pings");
    expect(query.mock.calls[3]?.[0]).toContain("expires_at = least(expires_at, $3::timestamptz)");
    expect(query.mock.calls[3]?.[0]).not.toContain("delete from map_pings");
    expect(query.mock.calls[3]?.[1]).toEqual([userId, pingIds, now.toISOString()]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("app_notifications"))).toBe(false);
  });

  it("does not issue updates when no active Ping needs revocation", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("from app_users")
        ? [{ id: userId }]
        : []
    }));
    const transaction = vi.fn(async <T>(operation: (client: DbClient) => Promise<T>) => operation({
      query: query as unknown as DbClient["query"],
      end: vi.fn()
    } as DbClient));
    const db = { query, transaction, end: vi.fn() } as unknown as DbClient;

    await expect(revokeActiveMapPings(db, userId)).resolves.toEqual({ pings: 0 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rolls back when Ping expiry fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.trim().toLowerCase() === "begin" || sql.trim().toLowerCase() === "rollback") {
        return { rows: [] };
      }
      if (sql.includes("from app_users") && sql.includes("for update")) {
        return { rows: [{ id: userId }] };
      }
      if (sql.includes("from map_pings") && sql.includes("for update")) {
        return { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] };
      }
      if (sql.includes("clock_timestamp()")) {
        return { rows: [{ revoked_at: now.toISOString() }] };
      }
      if (sql.includes("update map_pings")) {
        throw new Error("Ping expiry failed");
      }

      throw new Error(`Unexpected query: ${sql}`);
    });
    const db = { query, end: vi.fn() } as unknown as DbClient;

    await expect(revokeActiveMapPings(db, userId)).rejects.toThrow("Ping expiry failed");
    expect(query.mock.calls.some(([sql]) => String(sql).trim().toLowerCase() === "rollback")).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).trim().toLowerCase() === "commit")).toBe(false);
  });

  it("detects map changes that remove an existing viewer without flagging broader access", () => {
    const publicPolicy = mapPolicy();
    const ghostPolicy = mapPolicy({ baseMode: "GHOST" });

    expect(mapVisibilityNarrowed(publicPolicy, ghostPolicy)).toBe(true);
    expect(mapVisibilityNarrowed(ghostPolicy, mapPolicy({ baseMode: "STEALTH" }))).toBe(true);
    expect(mapVisibilityNarrowed(
      mapPolicy({ baseMode: "GHOST", ghostRadiusMeters: 1609 }),
      mapPolicy({ baseMode: "GHOST", ghostRadiusMeters: 4828 })
    )).toBe(true);
    expect(mapVisibilityNarrowed(
      mapPolicy({ baseMode: "GHOST", preciseToMutualCruushes: true }),
      mapPolicy({ baseMode: "GHOST", preciseToMutualCruushes: false })
    )).toBe(true);
    expect(mapVisibilityNarrowed(
      mapPolicy({
        baseMode: "GHOST",
        preciseToMutualCrowds: [{
          crowdId: "T4T",
          precisionEnabled: true,
          mutualityRequired: false,
          minimumTrustLevel: "MEMBER",
          createdAtMs: now.getTime(),
          revokedAtMs: null
        }]
      }),
      mapPolicy({
        baseMode: "GHOST",
        preciseToMutualCrowds: [{
          crowdId: "T4T",
          precisionEnabled: true,
          mutualityRequired: true,
          minimumTrustLevel: "MEMBER",
          createdAtMs: now.getTime(),
          revokedAtMs: null
        }]
      })
    )).toBe(true);
    expect(mapVisibilityNarrowed(
      mapPolicy({
        baseMode: "GHOST",
        preciseToMutualCrowds: [{
          crowdId: "T4T",
          precisionEnabled: true,
          mutualityRequired: true,
          minimumTrustLevel: "VERIFIED",
          createdAtMs: now.getTime(),
          revokedAtMs: null
        }]
      }),
      mapPolicy({
        baseMode: "GHOST",
        preciseToMutualCrowds: [{
          crowdId: "T4T",
          precisionEnabled: true,
          mutualityRequired: true,
          minimumTrustLevel: "MEMBER",
          createdAtMs: now.getTime(),
          revokedAtMs: null
        }]
      })
    )).toBe(false);
    expect(mapVisibilityNarrowed(
      mapPolicy({
        baseMode: "GHOST",
        preciseToMutualCrowds: [{
          crowdId: "T4T",
          precisionEnabled: true,
          mutualityRequired: false,
          minimumTrustLevel: "MEMBER",
          createdAtMs: now.getTime(),
          revokedAtMs: undefined as unknown as null
        }]
      }),
      mapPolicy({ baseMode: "GHOST", preciseToMutualCrowds: [] })
    )).toBe(true);
    expect(mapVisibilityNarrowed(ghostPolicy, publicPolicy)).toBe(false);
    expect(mapVisibilityNarrowed(
      mapPolicy({ baseMode: "GHOST", ghostRadiusMeters: 4828 }),
      mapPolicy({ baseMode: "GHOST", ghostRadiusMeters: 1609 })
    )).toBe(false);
  });

  it("detects profile rules that exclude a previously eligible viewer", () => {
    expect(profileVisibilityNarrowed(publicProfileRules, {
      ...publicProfileRules,
      distance: 10
    })).toBe(true);
    expect(profileVisibilityNarrowed({
      ...publicProfileRules,
      identities: ["bot"]
    }, {
      ...publicProfileRules,
      identities: ["bot", "spam"]
    })).toBe(true);
    expect(profileVisibilityNarrowed({
      ...publicProfileRules,
      active_crowd_modes: ["T4T", "Dyke"]
    }, {
      ...publicProfileRules,
      active_crowd_modes: ["T4T"]
    })).toBe(true);

    expect(profileVisibilityNarrowed({
      ...publicProfileRules,
      distance: 10,
      identities: ["bot", "spam"],
      active_crowd_modes: ["T4T"]
    }, {
      ...publicProfileRules,
      distance: 25,
      identities: ["bot"],
      active_crowd_modes: ["T4T", "Dyke"]
    })).toBe(false);
    expect(profileVisibilityNarrowed(publicProfileRules, publicProfileRules)).toBe(false);
  });
});
