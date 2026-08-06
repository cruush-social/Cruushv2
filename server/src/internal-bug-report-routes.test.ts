import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const query = vi.fn();
const end = vi.fn().mockResolvedValue(undefined);
const rateLimiter = createMemoryRateLimiter();

const INTERNAL_SECRET = "internal-secret-value-that-is-long-enough-32";
const REPORT_ID = "6bf1a2c3-1111-4222-8333-444455556666";

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
  MATCH_TOKEN_KEY_VERSION: "v1",
  INTERNAL_API_SECRET: INTERNAL_SECRET
} as AppConfig;

function buildInternalApp(overrides: Partial<AppConfig> = {}) {
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

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    subject: "Map pins vanish after zoom",
    message: "Every pin disappears when I pinch out past city level.",
    source: "settings",
    page_url: "https://cruush.app/feed",
    status: "open",
    ai_triage_status: "complete",
    dedupe_hash: "a".repeat(64),
    github_issue_number: 4242,
    triage_branch: null,
    triage_pr_url: null,
    triage_attempts: 1,
    has_contact_email: true,
    metadata: { userAgent: "Mozilla/5.0", screenshotAttached: true },
    created_at: "2026-08-04T12:00:00.000Z",
    ...overrides
  };
}

beforeEach(() => {
  query.mockReset();
  end.mockClear();
  rateLimiter.reset?.();
});

describe("internal bug report routes", () => {
  it("rejects requests without the internal secret", async () => {
    const app = buildInternalApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/bug-reports"
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects requests with a wrong internal secret", async () => {
    const app = buildInternalApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/bug-reports",
      headers: { "x-internal-secret": "not-the-secret" }
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it("lists bug reports without exposing reporter contact details", async () => {
    const app = buildInternalApp();
    query.mockResolvedValueOnce({ rows: [buildRow()] });

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/bug-reports?aiTriageStatus=complete&limit=10",
      headers: { "x-internal-secret": INTERNAL_SECRET }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[0]).toContain("category = 'bug'");
    expect(query.mock.calls[0]?.[1]).toEqual([10, "complete"]);

    const body = response.json();

    expect(body.data[0]).toMatchObject({
      id: REPORT_ID,
      githubIssueNumber: 4242,
      hasContactEmail: true
    });
    expect(JSON.stringify(body)).not.toContain("contact_email");
    expect(JSON.stringify(body)).not.toContain("contactEmail");
  });

  it("returns 404 for an unknown bug report", async () => {
    const app = buildInternalApp();
    query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: `/api/internal/bug-reports/${REPORT_ID}`,
      headers: { "x-internal-secret": INTERNAL_SECRET }
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });

  it("links a branch and pull request to a bug report", async () => {
    const app = buildInternalApp();
    query.mockResolvedValueOnce({
      rows: [buildRow({
        status: "in_progress",
        triage_branch: "bugfix/4242-map-pins",
        triage_pr_url: "https://github.com/cruush-social/Cruushv2/pull/512"
      })]
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/internal/bug-reports/${REPORT_ID}/link`,
      headers: { "x-internal-secret": INTERNAL_SECRET },
      payload: {
        branch: "bugfix/4242-map-pins",
        prUrl: "https://github.com/cruush-social/Cruushv2/pull/512",
        status: "in_progress"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      status: "in_progress",
      triageBranch: "bugfix/4242-map-pins",
      triagePrUrl: "https://github.com/cruush-social/Cruushv2/pull/512"
    });
  });

  it("refuses a branch outside the bugfix namespace", async () => {
    const app = buildInternalApp();

    const response = await app.inject({
      method: "POST",
      url: `/api/internal/bug-reports/${REPORT_ID}/link`,
      headers: { "x-internal-secret": INTERNAL_SECRET },
      payload: { branch: "main" }
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses a pull request URL on a host other than github.com", async () => {
    const app = buildInternalApp();

    const response = await app.inject({
      method: "POST",
      url: `/api/internal/bug-reports/${REPORT_ID}/link`,
      headers: { "x-internal-secret": INTERNAL_SECRET },
      payload: { prUrl: "https://github.com.evil.test/cruush-social/Cruushv2/pull/512" }
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
