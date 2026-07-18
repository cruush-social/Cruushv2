import { describe, expect, it, vi } from "vitest";
import {
  assertRequestNotSeverelyBanned,
  persistSevereAccessBan,
  severeAccessBanIdentity
} from "./severe-access-bans.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DbClient } from "./db.js";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const config = {
  SEVERE_ACCESS_BANS_ENABLED: true,
  SEVERE_ACCESS_BAN_HMAC_KEY: "0123456789abcdef0123456789abcdef",
  TRUST_PROXY_HOPS: 1
};

describe("severe access bans", () => {
  it("derives non-reversible device and trusted-IP hashes without retaining raw identifiers", () => {
    const request = {
      headers: { cookie: `cruush_device=${"A".repeat(43)}` },
      ip: "203.0.113.5"
    } as unknown as FastifyRequest;
    const identity = severeAccessBanIdentity(config, request);

    expect(identity.deviceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(identity)).not.toContain("203.0.113.5");
    expect(JSON.stringify(identity)).not.toContain("A".repeat(43));
  });

  it("writes both permanent identities and blocks a later matching request", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("select exists") ? [{ banned: true }] : []
    }));
    const db = { query } as unknown as DbClient;
    const identity = {
      deviceHash: "device-hash",
      ipHash: "ip-hash"
    };

    await persistSevereAccessBan(
      db,
      "11111111-1111-4111-8111-111111111111",
      "minor_face_detected",
      identity
    );
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("insert into severe_access_bans"))).toHaveLength(2);

    const request = {
      headers: { cookie: `cruush_device=${"A".repeat(43)}` },
      ip: "203.0.113.5"
    } as unknown as FastifyRequest;
    const app = {
      config,
      db
    } as unknown as FastifyInstance;

    await expect(assertRequestNotSeverelyBanned(app, request)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN"
    });
  });

  it("denies login before credentials are checked for a banned device or IP", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("from severe_access_bans") ? [{ banned: true }] : []
    }));
    const app = buildServer({
      NODE_ENV: "test",
      APP_DEPLOYMENT_STAGE: "staging",
      DATABASE_URL: "postgres://unused",
      CORS_ORIGIN: "http://localhost:5173",
      SESSION_SECRET: "test-secret",
      APP_URL: "http://localhost:5173",
      SEVERE_ACCESS_BANS_ENABLED: true,
      SEVERE_ACCESS_BAN_HMAC_KEY: config.SEVERE_ACCESS_BAN_HMAC_KEY,
      TRUST_PROXY_HOPS: 1
    } as AppConfig, {
      db: { query, end: vi.fn() } as unknown as DbClient,
      rateLimiter: createMemoryRateLimiter()
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        cookie: `cruush_device=${"A".repeat(43)}`
      },
      payload: {
        email: "banned@example.com",
        password: "password123"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "Access is permanently denied."
      }
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("from app_users"))).toBe(false);
  });
});
