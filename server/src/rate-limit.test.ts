import { describe, expect, it, vi } from "vitest";
import { createPostgresRateLimiter } from "./rate-limit.js";

describe("postgres rate limiter", () => {
  it("stores attempts in Postgres buckets", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        attempt_count: 1,
        reset_at: "2026-05-26T20:15:00.000Z"
      }]
    });
    const rateLimiter = createPostgresRateLimiter({
      query,
      end: vi.fn()
    });

    await rateLimiter.assert({
      key: "login:email:river@example.com",
      max: 5,
      windowMs: 15 * 60 * 1000,
      message: "Too many sign-in attempts. Try again later."
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("insert into rate_limit_buckets"),
      ["login:email:river@example.com", 5, 15 * 60 * 1000]
    );
  });

  it("rejects requests after the Postgres bucket exceeds the limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T20:00:00.000Z"));
    const query = vi.fn().mockResolvedValue({
      rows: [{
        attempt_count: 6,
        reset_at: "2026-05-26T20:15:00.000Z"
      }]
    });
    const rateLimiter = createPostgresRateLimiter({
      query,
      end: vi.fn()
    });

    await expect(rateLimiter.assert({
      key: "login:email:river@example.com",
      max: 5,
      windowMs: 15 * 60 * 1000,
      message: "Too many sign-in attempts. Try again later."
    })).rejects.toMatchObject({
      statusCode: 429,
      code: "RATE_LIMITED",
      message: "Too many sign-in attempts. Try again later.",
      details: {
        retryAfterSeconds: 900
      }
    });

    vi.useRealTimers();
  });
});
