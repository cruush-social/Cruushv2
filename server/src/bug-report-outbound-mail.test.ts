import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { sendSupportRequestReplyEmail } from "./mailer.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const userId = "10000000-0000-4000-8000-000000000001";
const config = {
  NODE_ENV: "test", PORT: 3001, HOST: "127.0.0.1", DATABASE_URL: "postgres://unused@127.0.0.1/unused",
  CORS_ORIGIN: "http://localhost:5173", SESSION_SECRET: "synthetic-test-secret", APP_URL: "https://cruush.test",
  RESEND_API_KEY: "re_synthetic", MAIL_FROM: "cruush <reports@cruush.test>", EMAIL_PREVIEW_ENABLED: false,
  DEVELOPMENT_ADMIN_ENABLED: false, DEVELOPMENT_ADMIN_PASSWORD: "", TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "", PROFILE_TOKEN_KEY: "", PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "", RELATIONSHIP_INDEX_KEY: "", RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1", MATCH_TOKEN_ENCRYPTION_KEY: "", MATCH_TOKEN_SIGNING_KEY: "", MATCH_TOKEN_KEY_VERSION: "v1"
} satisfies AppConfig;
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("bug-only outbound email privacy", () => {
  it.each([
    { category: "bug", source: "settings", signedIn: true },
    { category: "bug", source: "auth", signedIn: false },
    { category: "question", source: "settings", signedIn: true },
    { category: "comment", source: "survey", signedIn: true }
  ])("keeps contact linkage out of bug notifications only ($category/$source)", async ({ category, source, signedIn }) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("select email from app_users")) return { rows: [{ email: "private-contact@example.test" }] };
      if (sql.includes("moderator_users")) return { rows: [{ role: "admin" }] };
      if (sql.includes("insert into support_requests")) return { rows: [{ id: "synthetic-report", status: "open",
        ai_triage_status: "pending", created_at: new Date() }] };
      return { rows: [] };
    });
    const app = buildServer(config, { db: { query, end: vi.fn() } as unknown as DbClient,
      rateLimiter: createMemoryRateLimiter(), logger: false });
    try {
      const response = await app.inject({ method: "POST", url: "/api/support-requests",
        headers: signedIn ? { "x-user-id": userId } : {},
        payload: { category, source, subject: "Synthetic report", message: "Synthetic report content only.",
          contactEmail: "private-contact@example.test", linkAccountEmail: true } });
      expect(response.statusCode).toBe(201);
      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
      expect(body.to).toEqual(["reports@cruush.app"]);
      expect(body.text).toContain("synthetic-report");
      expect(body.text).toContain("Synthetic report content only.");
      if (category === "bug") {
        expect(body).not.toHaveProperty("reply_to");
        expect(JSON.stringify(body)).not.toContain("private-contact@example.test");
        expect(JSON.stringify(body)).not.toContain(userId);
      } else {
        expect(body.reply_to).toBe("private-contact@example.test");
        expect(body.text).toContain("private-contact@example.test");
        expect(body.text).toContain(userId);
      }
    } finally { await app.close(); }
  });

  it.each(["bug", "question"])("bounds provider handoff and redacts failure logs for bug replies only (%s)", async (category) => {
    const logger = { error: vi.fn() } as unknown as Parameters<typeof sendSupportRequestReplyEmail>[0]["logger"];
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(sendSupportRequestReplyEmail({ config, logger, replyToEmail: "private-contact@example.test",
      idempotencyKey: "bug-reply:synthetic-reply", replyMessage: "Synthetic reply.",
      request: { id: "synthetic-report", category, contactEmail: "private-contact@example.test", createdAt: new Date().toISOString(),
        message: "Synthetic report only.", pageUrl: "/settings", requesterUserId: userId, source: "settings", subject: "Synthetic report" }
    })).rejects.toThrow("Failed to send email");
    const options = fetchMock.mock.calls[0]?.[1];
    if (category === "bug") {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers["Idempotency-Key"]).toBe("bug-reply:synthetic-reply");
      expect(logger.error).toHaveBeenCalledWith({ statusCode: 503 }, expect.any(String));
    } else {
      expect(options).not.toHaveProperty("signal");
      expect(options.headers).not.toHaveProperty("Idempotency-Key");
      expect(logger.error).toHaveBeenCalledWith({ email: "private-contact@example.test", statusCode: 503 }, expect.any(String));
    }
  });
});
