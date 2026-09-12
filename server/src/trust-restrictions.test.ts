import { describe, expect, it } from "vitest";
import type { DbClient } from "./db.js";
import { getTrustRestrictions } from "./trust-restrictions.js";

const now = new Date("2026-09-12T12:00:00Z");
function fixture(overrides: Record<string, unknown> = {}, restrictions: Array<Record<string, unknown>> = []) {
  const queries: string[] = [];
  const profile = { trust_score: 10, max_future_trust: null, suspended: false,
    account_status: "active", owner_exempt: false, admin: false, active_suspensions: 0, ...overrides };
  return {
    queries,
    db: {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes("from app_users u")) return { rows: [profile] };
        if (sql.includes("from feature_restrictions")) return { rows: restrictions };
        if (sql.includes("from trust_events")) return { rows: [
          { value: -40, decays: true, permanent: false, created_at: now },
        ] };
        throw new Error("Unexpected query");
      },
      async end() {},
    } as DbClient,
  };
}

describe("read-only feature restriction status", () => {
  it("uses actual trust recovery and the later feature release without changing policy state", async () => {
    const endsAt = new Date("2026-09-20T12:00:00Z");
    const { db, queries } = fixture({}, [{ feature: "direct_messages", starts_at: now, ends_at: endsAt }]);
    const result = await getTrustRestrictions(db, "fixture", now);
    expect(result.features.direct_messages).toEqual({ restricted: true, dueToTrust: true, recoveryAt: endsAt.toISOString() });
    expect(Date.parse(result.features.feed_posting.recoveryAt!)).toBeGreaterThan(now.getTime());
    expect(Date.parse(result.features.feed_posting.recoveryAt!)).toBeLessThan(endsAt.getTime());
    expect(queries.every((sql) => sql.trimStart().startsWith("select"))).toBe(true);
    expect(result).not.toHaveProperty("trust_score");
  });

  it("preserves distinct administrator exemptions and does not forecast a capped score", async () => {
    const { db } = fixture({ admin: true, max_future_trust: 20 });
    const result = await getTrustRestrictions(db, "fixture", now);
    expect(result.features.direct_messages.restricted).toBe(false);
    expect(result.features.favorite_images.restricted).toBe(false);
    for (const feature of ["photo_uploads", "direct_message_photos", "group_creation", "feed_posting", "map_pings"]) {
      expect(result.features[feature]).toEqual({ restricted: true, dueToTrust: true, recoveryAt: null });
    }
  });

  it("reports timed and indefinite feature restrictions without attributing them to low trust", async () => {
    const endsAt = "2026-09-14T12:00:00.000Z";
    const { db } = fixture({ trust_score: 50 }, [
      { feature: "direct_messages", starts_at: now, ends_at: endsAt },
      { feature: "photo_uploads", starts_at: now, ends_at: null },
    ]);
    const result = await getTrustRestrictions(db, "fixture", now);
    expect(result.features.direct_messages).toEqual({ restricted: true, dueToTrust: false, recoveryAt: endsAt });
    expect(result.features.photo_uploads).toEqual({ restricted: true, dueToTrust: false, recoveryAt: null });
    expect(result.features.feed_posting.restricted).toBe(false);
  });
});
