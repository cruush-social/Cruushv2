import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const query = vi.fn();
const end = vi.fn().mockResolvedValue(undefined);
const rateLimiter = createMemoryRateLimiter();

const baseConfig: AppConfig = {
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
};

function buildSupportApp(overrides: Partial<AppConfig> = {}) {
  return buildServer({
    ...baseConfig,
    ...overrides
  }, {
    db: {
      query,
      end
    },
    rateLimiter
  });
}

beforeEach(() => {
  query.mockReset();
  end.mockClear();
  rateLimiter.reset?.();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("support routes", () => {
  const userId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";

  it("creates an anonymous support request with contact email", async () => {
    const app = buildSupportApp();
    query.mockResolvedValueOnce({
      rows: [{
        id: "support-1",
        status: "open",
        ai_triage_status: "pending",
        created_at: "2026-07-07T12:00:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      headers: {
        "user-agent": "vitest"
      },
      payload: {
        category: "question",
        subject: "Question about account access",
        message: "Can support help me understand the bank reviewer login path?",
        contactEmail: "reviewer@example.com",
        source: "auth",
        pageUrl: "https://cruush.test/"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into support_requests");
    expect(query.mock.calls[0]?.[1]).toEqual([
      null,
      "reviewer@example.com",
      "question",
      "Question about account access",
      "Can support help me understand the bank reviewer login path?",
      "auth",
      "https://cruush.test/",
      expect.objectContaining({
        userAgent: "vitest",
        aiSupport: expect.objectContaining({ status: "pending" })
      })
    ]);
    expect(response.json()).toEqual({
      data: {
        id: "support-1",
        status: "open",
        aiTriageStatus: "pending",
        createdAt: "2026-07-07T12:00:00.000Z"
      }
    });
  }, 10000);

  it("requires a reply email for signed-out support requests", async () => {
    const app = buildSupportApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      payload: {
        category: "bug",
        subject: "Map issue",
        message: "The map did not load after sign in.",
        source: "auth"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter an email so support can reply.",
        details: null
      }
    });
  }, 10000);

  it("creates a signed-in support request without requiring contact email", async () => {
    const app = buildSupportApp();
    query.mockResolvedValueOnce({
      rows: [{
        id: "support-2",
        status: "open",
        ai_triage_status: "pending",
        created_at: "2026-07-07T12:05:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      headers: {
        "x-user-id": userId
      },
      payload: {
        category: "bug",
        subject: "Settings bug",
        message: "The settings screen got stuck after opening support.",
        source: "settings"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[1]).toEqual([
      userId,
      null,
      "bug",
      "Settings bug",
      "The settings screen got stuck after opening support.",
      "settings",
      "",
      expect.objectContaining({
        userAgent: expect.any(String),
        aiSupport: expect.objectContaining({ status: "pending" })
      })
    ]);
  });

  it("forwards support requests to the reports inbox", async () => {
    const app = buildSupportApp({
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>",
      SUPPORT_INBOX_EMAIL: "support@cruush.app"
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ""
    });
    vi.stubGlobal("fetch", fetchMock);
    query.mockResolvedValueOnce({
      rows: [{
        id: "support-3",
        status: "open",
        ai_triage_status: "pending",
        created_at: "2026-07-07T12:10:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      payload: {
        category: "question",
        subject: "Can AI answer support?",
        message: "I want to know how most support replies will be handled.",
        contactEmail: "founder@example.com",
        source: "auth",
        pageUrl: "/"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    const emailBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(emailBody.to).toEqual(["reports@cruush.app"]);
    expect(emailBody.reply_to).toBe("founder@example.com");
    expect(emailBody.subject).toBe("[support] question: Can AI answer support?");
    expect(emailBody.html).toContain("support-3");
    expect(emailBody.html).toContain("I want to know how most support replies will be handled.");
  }, 10000);

  it("keeps support requests saved when support inbox delivery fails", async () => {
    const app = buildSupportApp({
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>",
      SUPPORT_INBOX_EMAIL: "support@cruush.app"
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway"
    });
    vi.stubGlobal("fetch", fetchMock);
    query.mockResolvedValueOnce({
      rows: [{
        id: "support-4",
        status: "open",
        ai_triage_status: "pending",
        created_at: "2026-07-07T12:15:00.000Z"
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      payload: {
        category: "bug",
        subject: "Inbox failure should not block",
        message: "The DB record should still be returned even if Resend fails.",
        contactEmail: "founder@example.com",
        source: "auth"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[0]).toContain("insert into support_requests");
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    expect(response.json()).toEqual({
      data: {
        id: "support-4",
        status: "open",
        aiTriageStatus: "pending",
        createdAt: "2026-07-07T12:15:00.000Z"
      }
    });
  });
});
