import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { ApiError } from "./errors.js";

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
});

describe("rewards and 2FA routes", () => {
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
