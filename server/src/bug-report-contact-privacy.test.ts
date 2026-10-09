import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const mail = vi.hoisted(() => ({ inbox: vi.fn(), reply: vi.fn() }));
vi.mock("./mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./mailer.js")>(),
  sendSupportRequestInboxEmail: mail.inbox,
  sendSupportRequestReplyEmail: mail.reply
}));

const staffId = "10000000-0000-4000-8000-000000000001";
const requesterId = "10000000-0000-4000-8000-000000000002";
const requestId = "10000000-0000-4000-8000-000000000003";
const now = new Date("2026-10-09T12:00:00.000Z");
const config = {
  NODE_ENV: "test", PORT: 3001, HOST: "127.0.0.1",
  DATABASE_URL: "postgres://unused@127.0.0.1/unused",
  CORS_ORIGIN: "http://localhost:5173", SESSION_SECRET: "synthetic-test-secret",
  APP_URL: "https://cruush.test", RESEND_API_KEY: "", MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: false, DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "", TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "", PROFILE_TOKEN_KEY: "", PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "", RELATIONSHIP_INDEX_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1", RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "", MATCH_TOKEN_SIGNING_KEY: "", MATCH_TOKEN_KEY_VERSION: "v1"
} satisfies AppConfig;

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId, requester_user_id: requesterId,
    requester_account_deleted_at: null,
    requester_display_name: "Synthetic requester",
    requester_email: "account-not-consented@example.test",
    contact_email: "consented@example.test", recipient_email: "consented@example.test",
    contact_email_opted_in: true, contact_email_expires_at: "2026-10-10T12:00:00.000Z",
    category: "bug", subject: "Synthetic bug", message: "Synthetic report for privacy tests.",
    source: "settings", page_url: "/settings", ai_triage_status: "pending", status: "open",
    metadata: {}, created_at: now, updated_at: now, total_count: 1,
    ...overrides
  };
}

function setup(row = report(), role: "admin" | "moderator" = "admin") {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("moderator_users")) return { rows: [{ role }] };
    if (sql.includes("select email from app_users")) return { rows: [{ email: "consented@example.test" }] };
    if (sql.includes("insert into support_request_replies")) return { rows: [{ id: "reply-test", created_at: now }] };
    if (sql.includes("select id from support_request_replies")) return { rows: [{ id: "reply-test" }] };
    if (sql.includes("insert into support_requests")) return { rows: [row] };
    if (sql.includes("select count(*)::int as total")) return { rows: [{ total: 1 }] };
    if (sql.includes("from support_requests support") || sql.includes("from support_requests sr")) return { rows: [row] };
    if (sql.includes("support_requests.contact_email as email")) return { rows: [{ ...row, email: row.contact_email }] };
    if (sql.includes("update support_requests") && sql.includes("returning")) return { rows: [row] };
    return { rows: [] };
  });
  const db = { query, end: vi.fn() } as unknown as DbClient;
  const app = buildServer(config, { db, rateLimiter: createMemoryRateLimiter(), logger: false });
  return { app, query };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  mail.inbox.mockReset().mockResolvedValue(undefined);
  mail.reply.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in privacy tests"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bug-report contact privacy", () => {
  const states = [
    { name: "active consent", fields: {}, visible: true },
    { name: "no consent", fields: { contact_email_opted_in: false }, visible: false },
    { name: "legacy missing consent", fields: { contact_email_opted_in: undefined }, visible: false },
    { name: "expired consent", fields: { contact_email_expires_at: "2026-10-08T12:00:00.000Z" }, visible: false },
    { name: "expiry boundary", fields: { contact_email_expires_at: now }, visible: false },
    { name: "missing expiry", fields: { contact_email_expires_at: null }, visible: false },
    { name: "purged contact", fields: { contact_email: null }, visible: false }
  ];

  for (const role of ["admin", "moderator"] as const) {
    it.each(states)(`${role} email access requires active opt-in: $name`, async ({ fields, visible }) => {
      const { app } = setup(report(fields), role);
      try {
        const allowed = visible && role === "admin";
        for (const url of ["/api/admin/moderation/support-requests", "/api/admin/support-requests"]) {
          const response = await app.inject({ method: "GET", url, headers: { "x-user-id": staffId } });
          expect(response.statusCode).toBe(200);
          const row = response.json().data.requests[0];
          expect(row.contactEmail).toBe(allowed ? "consented@example.test" : null);
          if (row.requester) expect(row.requester.email).toBe(allowed ? "consented@example.test" : null);
          if ("recipientEmail" in row) expect(row.recipientEmail).toBe(allowed ? "consented@example.test" : null);
          expect(response.body).not.toContain("account-not-consented@example.test");
        }
        const response = await app.inject({
          method: "PATCH", url: `/api/admin/moderation/support-requests/${requestId}`,
          headers: { "x-user-id": staffId }, payload: { status: "in_progress" }
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().data.request.contactEmail).toBe(allowed ? "consented@example.test" : null);
        expect(response.body).not.toContain("account-not-consented@example.test");
        // Clients may label a bug as a survey; that projection must not bypass
        // bug email rules, while normal survey permissions remain unchanged.
        const surveyResponse = await app.inject({
          method: "GET", url: "/api/admin/moderation/surveys", headers: { "x-user-id": staffId }
        });
        expect(surveyResponse.statusCode).toBe(200);
        expect(surveyResponse.json().data.surveys[0].email).toBe(allowed ? "consented@example.test" : null);
      } finally { await app.close(); }
    });
  }

  it.each(states.filter((state) => !state.visible))("rejects replies without live consent: $name", async ({ fields }) => {
    const { app, query } = setup(report(fields));
    try {
      const response = await app.inject({
        method: "POST", url: `/api/admin/support-requests/${requestId}/replies`,
        headers: { "x-user-id": staffId }, payload: { message: "Synthetic reply." }
      });
      expect(response.statusCode).toBe(400);
      expect(query.mock.calls.some(([sql]) => sql.includes("insert into support_request_replies"))).toBe(false);
      expect(mail.reply).not.toHaveBeenCalled();
      expect(response.body).not.toContain("@example.test");
    } finally { await app.close(); }
  });

  it("sends an opted-in bug reply without persisting another address copy", async () => {
    const { app, query } = setup();
    try {
      const response = await app.inject({
        method: "POST", url: `/api/admin/support-requests/${requestId}/replies`,
        headers: { "x-user-id": staffId }, payload: { message: "Synthetic reply." }
      });
      expect(response.statusCode).toBe(200);
      expect(mail.reply).toHaveBeenCalledWith(expect.objectContaining({ replyToEmail: "consented@example.test" }));
      const insert = query.mock.calls.find(([sql]) => sql.includes("insert into support_request_replies"));
      expect(insert?.[1]?.[2]).toBe("bug-contact@invalid");
      expect(response.json().data.reply.recipientEmail).toBe("consented@example.test");
    } finally { await app.close(); }
  });

  it("does not email after consent expires while the reply transaction completes", async () => {
    const { app, query } = setup();
    const implementation = query.getMockImplementation()!;
    query.mockImplementation(async (sql, params) => {
      const result = await implementation(sql, params);
      if (sql === "commit") vi.setSystemTime(new Date("2026-10-11T00:00:00.000Z"));
      return result;
    });
    try {
      const response = await app.inject({
        method: "POST", url: `/api/admin/support-requests/${requestId}/replies`,
        headers: { "x-user-id": staffId }, payload: { message: "Synthetic reply." }
      });
      expect(response.statusCode).toBe(400);
      expect(mail.reply).not.toHaveBeenCalled();
      expect(query.mock.calls.some(([sql, params]) => sql.includes("delivery_status = 'failed'") && params?.[0] === "reply-test")).toBe(true);
      expect(response.body).not.toContain("@example.test");
    } finally { await app.close(); }
  });

  it.each([
    { name: "account deletion", fields: { requester_account_deleted_at: now, contact_email: null } },
    { name: "consent withdrawal", fields: { contact_email_opted_in: false } },
    { name: "retention purge", fields: { contact_email: "bug-contact@invalid", contact_email_expires_at: null } }
  ])("revalidates after the insert commit: $name suppresses sending", async ({ fields }) => {
    const { app, query } = setup();
    const implementation = query.getMockImplementation()!;
    let committed = false;
    query.mockImplementation(async (sql, params) => {
      if (sql === "commit") committed = true;
      if (committed && sql.includes("from support_requests sr") && sql.includes("for share")) {
        return { rows: [report(fields)] };
      }
      return implementation(sql, params);
    });
    try {
      const response = await app.inject({ method: "POST", url: `/api/admin/support-requests/${requestId}/replies`,
        headers: { "x-user-id": staffId }, payload: { message: "Synthetic reply." } });
      expect(response.statusCode).toBe(400);
      expect(mail.reply).not.toHaveBeenCalled();
      expect(response.body).not.toContain("@example.test");
    } finally { await app.close(); }
  });

  it("uses the fresh contact and holds child then parent locks through the send", async () => {
    const { app, query } = setup();
    const implementation = query.getMockImplementation()!;
    query.mockImplementation(async (sql, params) => {
      if (sql.includes("from support_requests sr") && sql.includes("for share")) {
        return { rows: [report({ contact_email: "fresh-consent@example.test" })] };
      }
      return implementation(sql, params);
    });
    mail.reply.mockImplementation(async (input) => {
      expect(input.replyToEmail).toBe("fresh-consent@example.test");
      expect(input.idempotencyKey).toBe("bug-reply:reply-test");
      const calls = query.mock.calls.map(([sql]) => sql);
      expect(calls.at(-2)).toContain("from support_request_replies");
      expect(calls.at(-2)).toContain("for update");
      expect(calls.at(-1)).toContain("from support_requests sr");
      expect(calls.at(-1)).toContain("for share");
      expect(calls.filter((sql) => sql === "begin")).toHaveLength(2);
      expect(calls.filter((sql) => sql === "commit")).toHaveLength(1);
    });
    try {
      const response = await app.inject({ method: "POST", url: `/api/admin/support-requests/${requestId}/replies`,
        headers: { "x-user-id": staffId }, payload: { message: "Synthetic reply." } });
      expect(response.statusCode).toBe(200);
      expect(mail.reply).toHaveBeenCalledOnce();
      expect(response.json().data.reply.recipientEmail).toBe("fresh-consent@example.test");
      expect(query.mock.calls.filter(([sql]) => sql === "commit")).toHaveLength(2);
    } finally { await app.close(); }
  });

  it("still forbids a moderator from replying to an opted-in bug", async () => {
    const { app, query } = setup(report(), "moderator");
    try {
      const response = await app.inject({ method: "POST", url: `/api/admin/support-requests/${requestId}/replies`,
        headers: { "x-user-id": staffId }, payload: { message: "Synthetic reply." } });
      expect(response.statusCode).toBe(403);
      expect(query.mock.calls.some(([sql]) => sql.includes("insert into support_request_replies"))).toBe(false);
      expect(mail.reply).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it.each(["comment", "question", "suspension_appeal"])("preserves non-bug %s contact and moderator reply permissions", async (category) => {
    const { app, query } = setup(report({ category, source: category === "comment" ? "survey" : "auth",
      contact_email_opted_in: false, contact_email_expires_at: "2020-01-01T00:00:00.000Z" }), "moderator");
    try {
      const listed = await app.inject({ method: "GET", url: "/api/admin/support-requests", headers: { "x-user-id": staffId } });
      expect(listed.json().data.requests[0].contactEmail).toBe("consented@example.test");
      const response = await app.inject({ method: "POST", url: `/api/admin/support-requests/${requestId}/replies`,
        headers: { "x-user-id": staffId }, payload: { message: "Synthetic reply." } });
      expect(response.statusCode).toBe(200);
      expect(query.mock.calls.find(([sql]) => sql.includes("insert into support_request_replies"))?.[1]?.[2]).toBe("consented@example.test");
      expect(mail.reply).toHaveBeenCalledOnce();
      expect(query.mock.calls.some(([sql]) => sql.includes("for share") || sql.includes("for update"))).toBe(false);
      expect(mail.reply.mock.calls[0]?.[0]).not.toHaveProperty("idempotencyKey");
    } finally { await app.close(); }
  });

  it.each(["admin", "moderator"] as const)("preserves ordinary survey email permissions for %s", async (role) => {
    const { app } = setup(report({ category: "comment", source: "survey", contact_email_opted_in: false,
      contact_email_expires_at: null }), role);
    try {
      const response = await app.inject({ method: "GET", url: "/api/admin/moderation/surveys", headers: { "x-user-id": staffId } });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.surveys[0].email).toBe(role === "admin" ? "consented@example.test" : null);
    } finally { await app.close(); }
  });

  it.each([
    { name: "signed-in opt-in", signedIn: true, optIn: true, expected: "consented@example.test" },
    { name: "signed-in no opt-in", signedIn: true, optIn: false, expected: null },
    { name: "signed-out supplied reply address", signedIn: false, optIn: false, expected: "supplied@example.test" }
  ])("records bug consent only for $name", async ({ signedIn, optIn, expected }) => {
    const { app, query } = setup();
    try {
      const response = await app.inject({ method: "POST", url: "/api/support-requests",
        headers: signedIn ? { "x-user-id": requesterId } : {},
        payload: { category: "bug", source: "auth", subject: "Synthetic bug", message: "Synthetic bug report only.",
          contactEmail: "supplied@example.test", linkAccountEmail: optIn } });
      expect(response.statusCode).toBe(201);
      const insert = query.mock.calls.find(([sql]) => sql.includes("insert into support_requests"));
      expect(insert?.[1]?.[1]).toBe(expected);
      expect(insert?.[0]).toContain("contact_email_opted_in");
      expect(insert?.[0]).toContain("($3 = 'bug' and $2 is not null)");
      expect(insert?.[0]).toContain("now() + interval '30 days'");
    } finally { await app.close(); }
  });
});
