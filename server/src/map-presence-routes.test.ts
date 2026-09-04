import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const userId = "11111111-1111-4111-8111-111111111111";

function buildTestApp(query = vi.fn()) {
  const end = vi.fn().mockResolvedValue(undefined);
  const app = buildServer({
    NODE_ENV: "test",
    PORT: 3001,
    HOST: "127.0.0.1",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
    CORS_ORIGIN: "http://localhost:5173",
    SESSION_SECRET: "test-secret",
    APP_URL: "https://cruush.test",
    RESEND_API_KEY: "",
    MAIL_FROM: "",
    EMAIL_PREVIEW_ENABLED: true,
    DEVELOPMENT_ADMIN_ENABLED: false,
    DEVELOPMENT_ADMIN_PASSWORD: "",
    TURNSTILE_SECRET_KEY: "",
    PROFILE_ENCRYPTION_KEY: "",
    PROFILE_TOKEN_KEY: "",
    PROFILE_TOKEN_KEY_VERSION: "v1",
    RELATIONSHIP_ENCRYPTION_KEY: "",
    RELATIONSHIP_INDEX_KEY: "",
    RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
    RELATIONSHIP_INDEX_KEY_VERSION: "v1",
    MATCH_TOKEN_ENCRYPTION_KEY: "",
    MATCH_TOKEN_SIGNING_KEY: "",
    MATCH_TOKEN_KEY_VERSION: "v1"
  }, {
    db: {
      query,
      end
    },
    rateLimiter: createMemoryRateLimiter(),
    logger: false
  });

  return { app, query, end };
}

describe("map presence routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults map presence to seven days when the account has no saved row", async () => {
    const { app } = buildTestApp(vi.fn().mockResolvedValue({ rows: [] }));

    const response = await app.inject({
      method: "GET",
      url: "/api/privacy/map-presence",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        hours: 168,
        minHours: 1,
        maxHours: 168
      }
    });

    await app.close();
  }, 10_000);

  it("returns the saved map presence duration", async () => {
    const { app } = buildTestApp(vi.fn().mockResolvedValue({ rows: [{ map_presence_hours: 48 }] }));

    const response = await app.inject({
      method: "GET",
      url: "/api/privacy/map-presence",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.hours).toBe(48);

    await app.close();
  });

  it("casts both uses of the hours parameter so Postgres can deduce its type", async () => {
    // A mocked query cannot reject the statement, so the shape is pinned here:
    // using $2 as an integer column and as numeric in the same statement made
    // Postgres refuse every save with "inconsistent types deduced for
    // parameter $2", so map presence could never be changed.
    const query = vi.fn().mockResolvedValue({ rows: [{ map_presence_hours: 3 }] });
    const { app } = buildTestApp(query);

    await app.inject({
      method: "PUT",
      url: "/api/privacy/map-presence",
      headers: { "x-user-id": userId },
      payload: { hours: 3 }
    });

    const statement = String(query.mock.calls.at(-1)?.[0]);
    expect(statement).toContain("$2::integer");
    expect(statement).toContain("$2::numeric");
    expect(statement).not.toMatch(/ceil\(\$2 \//);

    await app.close();
  });

  it("upserts a new map presence duration for the signed-in account", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ map_presence_hours: 3 }] });
    const { app } = buildTestApp(query);

    const response = await app.inject({
      method: "PUT",
      url: "/api/privacy/map-presence",
      headers: {
        "x-user-id": userId
      },
      payload: {
        hours: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.hours).toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("insert into user_privacy_settings (user_id, map_presence_hours, map_presence_days)"),
      [userId, 3]
    );

    await app.close();
  });

  it("rejects a map presence duration outside the supported range", async () => {
    const { app } = buildTestApp(vi.fn().mockResolvedValue({ rows: [] }));

    const response = await app.inject({
      method: "PUT",
      url: "/api/privacy/map-presence",
      headers: {
        "x-user-id": userId
      },
      payload: {
        hours: 169
      }
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});
