import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { sendSupportRequestInboxEmail } from "./mailer.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "re_test",
  MAIL_FROM: "cruush <hello@cruush.test>",
  EMAIL_PREVIEW_ENABLED: false,
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

const logger = {
  error: vi.fn(),
  info: vi.fn()
} as any;

describe("support mailer", () => {
  it("sends support requests to the configured support inbox with reply-to", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendSupportRequestInboxEmail({
      config: {
        ...config,
        SUPPORT_INBOX_EMAIL: "support@cruush.app"
      },
      logger,
      request: {
        id: "support-1",
        category: "question",
        contactEmail: "founder@example.com",
        createdAt: "2026-07-07T12:00:00.000Z",
        message: "Can AI answer most support questions?",
        pageUrl: "/settings",
        requesterUserId: "user-1",
        source: "settings",
        subject: "Support inbox"
      }
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.to).toEqual(["support@cruush.app"]);
    expect(body.reply_to).toBe("founder@example.com");
    expect(body.subject).toBe("[support] question: Support inbox");
    expect(body.html).toContain("support-1");
    expect(body.text).toContain("Can AI answer most support questions?");
  });
});
