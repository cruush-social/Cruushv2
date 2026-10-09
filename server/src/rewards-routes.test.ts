import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";

const twoFactor = vi.hoisted(() => ({
  completeTwoFactorSetup: vi.fn()
}));
const referrals = vi.hoisted(() => ({
  qualifyPendingReferrals: vi.fn()
}));
const rewards = vi.hoisted(() => ({
  recordMeaningfulActivity: vi.fn()
}));

vi.mock("./two-factor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./two-factor.js")>(),
  completeTwoFactorSetup: twoFactor.completeTwoFactorSetup
}));

vi.mock("./referrals-service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./referrals-service.js")>(),
  qualifyPendingReferrals: referrals.qualifyPendingReferrals
}));

vi.mock("./rewards-service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./rewards-service.js")>(),
  recordMeaningfulActivity: rewards.recordMeaningfulActivity
}));

const userId = "8b2f51cf-65e2-4cb3-b09b-c8cc3e3bbb21";
const apps: ReturnType<typeof buildServer>[] = [];

function testConfig() {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://test",
    SESSION_SECRET: "test-secret",
    APP_URL: "https://cruush.test"
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  twoFactor.completeTwoFactorSetup.mockReset();
  referrals.qualifyPendingReferrals.mockReset();
  rewards.recordMeaningfulActivity.mockReset();
});

describe("rewards and 2FA routes", () => {
  it("replays an owned reward outside recent history without changing entitlements", async () => {
    const grantId = "bd91eaec-4fdb-485e-9552-de9849652ad2";
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("where reward.user_id = $1 and reward.id = $2");
      expect(params).toEqual([userId, grantId]);
      expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
      return { rows: [{
        id: grantId, user_id: userId, source: "admin", days: 1,
        created_at: "2025-01-01T00:00:00.000Z", reversed_at: null,
        audit_metadata: { sideQuest: "send_message", privateAuditDetail: "not public" }
      }], rowCount: 1 };
    });
    const app = buildServer(testConfig(), {
      logger: false,
      db: { query, end: vi.fn() } as unknown as DbClient
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET", url: `/api/rewards/grants/${grantId}`, headers: { "x-user-id": userId }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: {
      id: grantId, source: "admin", days: 1, status: "active",
      createdAt: "2025-01-01T00:00:00.000Z", sideQuestKey: "send_message"
    } });
    expect(query).toHaveBeenCalledOnce();
  });

  it("does not reveal missing or another member's reward, or read without authentication", async () => {
    const grantId = "bd91eaec-4fdb-485e-9552-de9849652ad2";
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const app = buildServer(testConfig(), { logger: false, db: { query, end: vi.fn() } });
    apps.push(app);
    const url = `/api/rewards/grants/${grantId}`;
    const anonymous = await app.inject({ method: "GET", url });
    expect(anonymous.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
    const missing = await app.inject({ method: "GET", url, headers: { "x-user-id": userId } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("where reward.user_id = $1 and reward.id = $2"), [userId, grantId]
    );
  });

  it("requires authentication for reward summaries", async () => {
    const app = buildServer(testConfig(), {
      logger: false,
      db: {
        query: vi.fn(),
        end: vi.fn()
      }
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/api/rewards/summary"
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "AUTH_REQUIRED" }
    });
  });

  it("records one daily check-in for an active authenticated account", async () => {
    rewards.recordMeaningfulActivity.mockResolvedValue({
      credited: true,
      activityDate: "2026-08-11",
      timezone: "America/New_York",
      currentStreak: 7,
      grants: [{ id: "grant-1", source: "activity_recurring", days: 1 }]
    });
    const app = buildServer(testConfig(), {
      logger: false,
      db: { query: vi.fn(), end: vi.fn() }
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/rewards/check-in",
      headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        credited: true,
        currentStreak: 7,
        grants: [{ source: "activity_recurring", days: 1 }]
      }
    });
    expect(rewards.recordMeaningfulActivity.mock.calls[0]?.[1]).toEqual({
      userId,
      activityType: "check_in"
    });
  });

  it("rejects unauthenticated daily check-ins without recording activity", async () => {
    const app = buildServer(testConfig(), {
      logger: false,
      db: { query: vi.fn(), end: vi.fn() }
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/rewards/check-in"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
    expect(rewards.recordMeaningfulActivity).not.toHaveBeenCalled();
  });

  it("rate limits 2FA setup attempts before handling credentials", async () => {
    const assert = vi.fn(async () => {
      throw new ApiError(429, "RATE_LIMITED", "Too many two-factor attempts. Try again later.");
    });
    const query = vi.fn();
    const app = buildServer(testConfig(), {
      logger: false,
      db: { query, end: vi.fn() },
      rateLimiter: { assert }
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/2fa/setup",
      headers: { "x-user-id": userId },
      payload: { password: "correct-password" }
    });

    expect(response.statusCode).toBe(429);
    expect(assert).toHaveBeenCalledWith(expect.objectContaining({
      key: `two-factor:setup:user:${userId}`,
      max: 5
    }));
    expect(query).not.toHaveBeenCalled();
  });

  it("qualifies the invited account's referral after successful 2FA without changing the response", async () => {
    twoFactor.completeTwoFactorSetup.mockResolvedValue({
      enabled: true,
      recoveryCodes: ["alpha-bravo-charlie"]
    });
    referrals.qualifyPendingReferrals.mockResolvedValue({
      scanned: 1,
      rewarded: 1,
      pending: 0,
      rejected: 0,
      flagged: 0,
      skipped: 0,
      qualified: 0
    });
    const app = buildServer(testConfig(), {
      logger: false,
      db: { query: vi.fn(), end: vi.fn() },
      rateLimiter: { assert: vi.fn(async () => undefined) }
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/2fa/setup/complete",
      headers: { "x-user-id": userId },
      payload: { token: "123456" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { enabled: true, recoveryCodes: ["alpha-bravo-charlie"] }
    });
    expect(twoFactor.completeTwoFactorSetup.mock.calls[0]?.slice(1)).toEqual([userId, "123456"]);
    expect(referrals.qualifyPendingReferrals.mock.calls[0]?.slice(1)).toEqual([{
      referredUserId: userId,
      limit: 1
    }]);
  });

  it("serializes referral totals and links without fraud signals", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ code: "abcdefghijklmnop" }] })
      .mockResolvedValueOnce({
        rows: [{ pending: 2, qualified: 1, flagged: 3 }]
      });
    const app = buildServer(testConfig(), {
      logger: false,
      db: { query, end: vi.fn() }
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/api/rewards/referrals",
      headers: { "x-user-id": userId }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data).toEqual({
      code: "abcdefghijklmnop",
      link: "https://cruush.test/?ref=abcdefghijklmnop",
      pendingCount: 2,
      qualifiedCount: 1,
      underReviewCount: 3
    });
    expect(JSON.stringify(body)).not.toMatch(/ipHash|deviceHash|riskScore|reviewFlags/i);
  });
});
