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

describe("user notice routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an undismissed state when the account has not seen the notice", async () => {
    const { app, query } = buildTestApp(vi.fn().mockResolvedValue({ rows: [] }));

    const response = await app.inject({
      method: "GET",
      url: "/api/users/me/notices/cruush:map-controls-intro-seen",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        dismissed: false,
        dismissedAt: null
      }
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from user_notice_dismissals"), [
      userId,
      "cruush:map-controls-intro-seen"
    ]);

    await app.close();
  });

  it("upserts notice dismissal for the signed-in account", async () => {
    const dismissedAt = "2026-07-31T12:00:00.000Z";
    const { app, query } = buildTestApp(vi.fn().mockResolvedValue({
      rows: [{ dismissed_at: dismissedAt }]
    }));

    const response = await app.inject({
      method: "PUT",
      url: "/api/users/me/notices/cruush:map-controls-intro-seen",
      headers: {
        "x-user-id": userId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        dismissed: true,
        dismissedAt
      }
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("on conflict (user_id, notice_key)"), [
      userId,
      "cruush:map-controls-intro-seen"
    ]);

    await app.close();
  });

  it("requires authentication", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/users/me/notices/cruush:map-controls-intro-seen"
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
