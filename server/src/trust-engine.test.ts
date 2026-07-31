import { describe, expect, it, vi } from "vitest";
import {
  calculateTrustScore,
  clampTrustScore,
  recalculateDecayingTrustProfiles,
  recalculateTrustProfile,
  reportWeightForScore,
  trustLevelForScore
} from "./trust-engine.js";
import type { DbClient } from "./db.js";

describe("trust engine calculations", () => {
  it("clamps trust scores to the 0-100 range", () => {
    expect(clampTrustScore(-50)).toBe(0);
    expect(clampTrustScore(42.4)).toBe(42);
    expect(clampTrustScore(140)).toBe(100);
  });

  it("rebuilds trust from immutable events and applies a future trust cap", () => {
    const score = calculateTrustScore([
      { value: 10 },
      { value: -30 },
      { value: -20 }
    ], 60);

    expect(score).toBe(10);
  });

  it("uses the cap even when event totals would recover above it", () => {
    const score = calculateTrustScore([
      { value: 45 }
    ], 70);

    expect(score).toBe(70);
  });

  it("recovers decaying negative trust events over fourteen days", () => {
    const score = calculateTrustScore([
      {
        value: -40,
        decays: true,
        permanent: false,
        createdAt: new Date("2026-07-01T00:00:00.000Z")
      }
    ], null, new Date("2026-07-08T00:00:00.000Z"));

    expect(score).toBe(30);
  });

  it("fully recovers decaying negative trust events after the decay window", () => {
    const score = calculateTrustScore([
      {
        value: -40,
        decays: true,
        permanent: false,
        createdAt: new Date("2026-07-01T00:00:00.000Z")
      }
    ], null, new Date("2026-07-16T00:00:00.000Z"));

    expect(score).toBe(50);
  });

  it("keeps permanent trust events at full impact", () => {
    const score = calculateTrustScore([
      {
        value: -40,
        decays: false,
        permanent: true,
        createdAt: new Date("2026-07-01T00:00:00.000Z")
      }
    ], null, new Date("2026-08-01T00:00:00.000Z"));

    expect(score).toBe(10);
  });

  it("uses decayed trust event values when recalculating persisted profiles", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await recalculateTrustProfile({ query } as unknown as DbClient, "user-id");

    const recalculationSql = String(query.mock.calls[2]?.[0] ?? "");
    expect(recalculationSql).toContain("extract(epoch from (now() - created_at))");
    expect(recalculationSql).toContain("decays = true");
    expect(recalculationSql).toContain("permanent = false");
  });

  it("keeps the owner full access account at verified trust", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "julienlenazny@gmail.com" }] })
      .mockResolvedValueOnce({ rows: [] });

    await recalculateTrustProfile({ query } as unknown as DbClient, "owner-user-id");

    const ownerTrustSql = String(query.mock.calls[2]?.[0] ?? "");
    expect(ownerTrustSql).toContain("trust_score");
    expect(ownerTrustSql).toContain("verified_trusted");
    expect(ownerTrustSql).not.toContain("event_score");
  });

  it("recalculates users with decaying negative trust events", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1" }, { user_id: "user-2" }] })
      .mockResolvedValue({ rows: [] });

    const recalculated = await recalculateDecayingTrustProfiles({ query } as unknown as DbClient, 2);

    const candidateSql = String(query.mock.calls[0]?.[0] ?? "");
    expect(recalculated).toBe(2);
    expect(candidateSql).toContain("value < 0");
    expect(candidateSql).toContain("decays = true");
    expect(candidateSql).toContain("permanent = false");
    expect(query.mock.calls.some(([, params]) => Array.isArray(params) && params[0] === "user-1")).toBe(true);
    expect(query.mock.calls.some(([, params]) => Array.isArray(params) && params[0] === "user-2")).toBe(true);
  });

  it("maps launch trust levels from the score bands", () => {
    expect(trustLevelForScore(20)).toBe("restricted");
    expect(trustLevelForScore(49)).toBe("new");
    expect(trustLevelForScore(74)).toBe("established");
    expect(trustLevelForScore(89)).toBe("trusted");
    expect(trustLevelForScore(90)).toBe("verified_trusted");
  });

  it("bounds report weight independently from exact trust visibility", () => {
    expect(reportWeightForScore(0)).toBe(5);
    expect(reportWeightForScore(50)).toBe(50);
    expect(reportWeightForScore(125)).toBe(100);
  });
});
