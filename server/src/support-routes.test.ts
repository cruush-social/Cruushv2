import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function suspensionAppealMultipart() {
  const boundary = "----cruush-suspension-appeal-test";
  const field = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="contactEmail"\r\n\r\n' +
    'appeal@example.com\r\n'
  );
  const idHead = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="idDocument"; filename="redacted-id.jpg"\r\n' +
    'Content-Type: image/jpeg\r\n\r\n'
  );
  const selfieHead = Buffer.from(
    `\r\n--${boundary}\r\n` +
    'Content-Disposition: form-data; name="selfie"; filename="selfie.jpg"\r\n' +
    'Content-Type: image/jpeg\r\n\r\n'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat([
      field,
      idHead,
      Buffer.from('synthetic-redacted-id'),
      selfieHead,
      Buffer.from('synthetic-selfie-with-sign'),
      tail
    ])
  };
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

  it("accepts a signed-out age suspension appeal and stores both evidence files encrypted", async () => {
    const mediaDir = await mkdtemp(join(tmpdir(), "cruush-appeal-test-"));
    const appealId = "f5318c56-f1aa-4cc4-8a4b-ea73c4fc4149";
    const app = buildSupportApp({
      MEDIA_STORAGE_DIR: mediaDir,
      MEDIA_OBJECT_STORAGE_DRIVER: "local",
      MEDIA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
      MEDIA_ENCRYPTION_KEY_VERSION: "v1",
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>"
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ""
    });
    vi.stubGlobal("fetch", fetchMock);
    query
      .mockResolvedValueOnce({
        rows: [{
          id: appealId,
          status: "open",
          ai_triage_status: "pending",
          created_at: "2026-08-18T12:00:00.000Z"
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const multipart = suspensionAppealMultipart();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/support-requests/suspension-appeal",
        headers: {
          "content-type": multipart.contentType,
          "user-agent": "vitest"
        },
        payload: multipart.payload
      });

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toEqual({
        data: {
          id: appealId,
          status: "open",
          aiTriageStatus: "pending",
          createdAt: "2026-08-18T12:00:00.000Z"
        }
      });
      expect(query.mock.calls[0]?.[1]).toEqual([
        null,
        "appeal@example.com",
        expect.stringContaining("redacted ID"),
        expect.objectContaining({
          evidenceStoredPrivately: true,
          evidenceExpiresInHours: 24
        })
      ]);
      expect(query.mock.calls.slice(1, 3).every((call) => String(call[0]).includes("insert into suspension_appeal_evidence"))).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
      const emailBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
      expect(emailBody.to).toEqual(["reports@cruush.app"]);
      expect(emailBody.reply_to).toBe("appeal@example.com");
      expect(emailBody.subject).toBe("[support] suspension_appeal: Suspension appeal");
      expect(emailBody.attachments).toBeUndefined();

      const evidenceDir = join(mediaDir, "objects", "suspension-appeals", appealId);
      const evidenceFiles = await readdir(evidenceDir);
      expect(evidenceFiles).toHaveLength(2);
      const encryptedBytes = await Promise.all(evidenceFiles.map((file) => readFile(join(evidenceDir, file))));
      expect(Buffer.concat(encryptedBytes).toString()).not.toContain("synthetic-redacted-id");
      expect(Buffer.concat(encryptedBytes).toString()).not.toContain("synthetic-selfie-with-sign");
    } finally {
      await app.close();
      await rm(mediaDir, { recursive: true, force: true });
    }
  }, 10000);

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

  it("requires authentication before accepting a survey response", async () => {
    const app = buildSupportApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      payload: {
        category: "comment",
        subject: "cruush survey response",
        message: "Overall experience: 5",
        source: "survey",
        pageUrl: "https://cruush.test/survey"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
    expect(query).not.toHaveBeenCalled();
  }, 10000);

  it("creates one active survey response for a signed-in member", async () => {
    const app = buildSupportApp();
    query
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "survey-response-1",
          status: "open",
          ai_triage_status: "pending",
          created_at: "2026-08-18T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      headers: { "x-user-id": userId },
      payload: {
        category: "comment",
        subject: "cruush survey response",
        message: "Overall experience: 5",
        source: "survey",
        pageUrl: "https://cruush.test/survey"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[1]?.[0]).toContain("on conflict do nothing");
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "member@example.com",
      "comment",
      "cruush survey response",
      "Overall experience: 5",
      "survey",
      "https://cruush.test/survey",
      expect.objectContaining({
        aiSupport: expect.objectContaining({ status: "pending" })
      })
    ]);
  }, 10000);

  it("returns the existing active survey response instead of inserting a duplicate", async () => {
    const app = buildSupportApp();
    query
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "survey-response-1",
          status: "open",
          ai_triage_status: "pending",
          created_at: "2026-08-18T12:00:00.000Z"
        }]
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/support-requests",
      headers: { "x-user-id": userId },
      payload: {
        category: "comment",
        subject: "cruush survey response",
        message: "Overall experience: 5",
        source: "survey",
        pageUrl: "https://cruush.test/survey"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2]?.[0]).toContain("status in ('open', 'in_progress')");
    expect(response.json().data.id).toBe("survey-response-1");
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
    query
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com" }] })
      .mockResolvedValueOnce({
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
        source: "settings",
        pageUrl: "/settings",
        device: {
          model: "Pixel 9",
          platform: "Android",
          platformVersion: "16",
          mobile: true
        }
      }
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[1]?.[1]).toEqual([
      userId,
      "member@example.com",
      "bug",
      "Settings bug",
      "The settings screen got stuck after opening support.",
      "settings",
      "/settings",
      expect.objectContaining({
        userAgent: expect.any(String),
        device: {
          model: "Pixel 9",
          platform: "Android",
          platformVersion: "16",
          mobile: true
        },
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

  it("lists support requests for moderator replies", async () => {
    const app = buildSupportApp();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("moderator_users")) {
        return { rows: [{ role: "admin" }] };
      }

      if (sql.includes("select count(*)::int as total")) {
        return { rows: [{ total: 1 }] };
      }

      if (sql.includes("from support_requests sr") && sql.includes("left join lateral")) {
        return {
          rows: [{
            id: "support-5",
            requester_user_id: "user-5",
            contact_email: "reporter@example.com",
            category: "suspension_appeal",
            subject: "Suspension appeal",
            message: "Please review my age suspension.",
            source: "auth",
            page_url: "/support?appeal=1",
            ai_triage_status: "pending",
            status: "open",
            created_at: "2026-07-07T12:20:00.000Z",
            updated_at: "2026-07-07T12:20:00.000Z",
            recipient_email: "reporter@example.com",
            reply_count: 0,
            last_reply_at: null,
            appeal_evidence_types: ["id", "selfie"]
          }]
        };
      }

      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/support-requests?status=open&category=suspension_appeal&limit=25&offset=0",
      headers: {
        "x-user-id": userId
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        requests: [{
          id: "support-5",
          requesterUserId: "user-5",
          contactEmail: "reporter@example.com",
          category: "suspension_appeal",
          subject: "Suspension appeal",
          message: "Please review my age suspension.",
          source: "auth",
          pageUrl: "/support?appeal=1",
          aiTriageStatus: "pending",
          status: "open",
          createdAt: "2026-07-07T12:20:00.000Z",
          updatedAt: "2026-07-07T12:20:00.000Z",
          recipientEmail: "reporter@example.com",
          replyCount: 0,
          lastReplyAt: null,
          appealEvidence: [
            {
              type: "id",
              previewUrl: "/api/admin/moderation/support-requests/support-5/appeal-evidence/id"
            },
            {
              type: "selfie",
              previewUrl: "/api/admin/moderation/support-requests/support-5/appeal-evidence/selfie"
            }
          ]
        }],
        page: {
          limit: 25,
          offset: 0,
          total: 1,
          hasMore: false
        }
      }
    });
    expect(query.mock.calls.some(([, params]) => JSON.stringify(params) === JSON.stringify(["open", "suspension_appeal", 25, 0]))).toBe(true);
  });

  it("saves and emails a support reply", async () => {
    const app = buildSupportApp({
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "cruush <hello@cruush.test>"
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ""
    });
    vi.stubGlobal("fetch", fetchMock);
    query.mockImplementation(async (sql: string) => {
      if (sql === "begin" || sql === "commit" || sql === "rollback") {
        return { rows: [] };
      }

      if (sql.includes("moderator_users")) {
        return { rows: [{ role: "admin" }] };
      }

      if (sql.includes("from support_requests sr") && sql.includes("recipient_email") && sql.includes("requester_user_id")) {
        return {
          rows: [{
            id: "11111111-1111-4111-8111-111111111116",
            category: "bug",
            subject: "Broken upload",
            message: "Uploads crash on mobile.",
            page_url: "/settings",
            source: "settings",
            created_at: "2026-07-07T12:25:00.000Z",
            recipient_email: "reporter@example.com",
            requester_user_id: "user-6"
          }]
        };
      }

      if (sql.includes("insert into support_request_replies")) {
        return {
          rows: [{
            id: "reply-1",
            created_at: "2026-07-07T12:30:00.000Z"
          }]
        };
      }

      if (sql.includes("update support_requests")) {
        return { rows: [] };
      }

      if (sql.includes("update support_request_replies")) {
        return { rows: [] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/support-requests/11111111-1111-4111-8111-111111111116/replies",
      headers: {
        "x-user-id": userId
      },
      payload: {
        message: "We fixed the upload path in the next build."
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    const emailBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(emailBody.to).toEqual(["reporter@example.com"]);
    expect(emailBody.reply_to).toBe("reports@cruush.app");
    expect(emailBody.subject).toBe("Re: [support] bug: Broken upload");
    expect(response.json()).toEqual({
      data: {
        reply: {
          id: "reply-1",
          createdAt: "2026-07-07T12:30:00.000Z",
          deliveryStatus: "sent",
          recipientEmail: "reporter@example.com"
        }
      }
    });
  }, 10000);
});
