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
        days: 7,
        minDays: 1,
        maxDays: 30
      }
    });

    await app.close();
  });

  it("returns the saved map presence duration", async () => {
    const { app } = buildTestApp(vi.fn().mockResolvedValue({ rows: [{ map_presence_days: 14 }] }));

    const response = await app.inject({
      method: "GET",
      url: "/api/privacy/map-presence",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.days).toBe(14);

    await app.close();
  });

  it("upserts a new map presence duration for the signed-in account", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ map_presence_days: 3 }] });
    const { app } = buildTestApp(query);

    const response = await app.inject({
      method: "PUT",
      url: "/api/privacy/map-presence",
      headers: {
        "x-user-id": userId
      },
      payload: {
        days: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.days).toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("insert into user_privacy_settings (user_id, map_presence_days)"),
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
        days: 90
      }
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});
