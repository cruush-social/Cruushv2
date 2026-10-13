import { createHmac } from "node:crypto";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import {
  NEWSLETTER_UNSUBSCRIBE_PATH,
  createNewsletterUnsubscribeToken,
  createNewsletterUnsubscribeUrl,
  readNewsletterUnsubscribeToken
} from "./newsletter-unsubscribe.js";

const CONTACT_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_CONTACT_ID = "22222222-2222-4333-8444-555555555555";
const config = {
  NODE_ENV: "production",
  APP_DEPLOYMENT_STAGE: "production",
  SESSION_SECRET: "synthetic-newsletter-secret-for-handler-tests-only",
  RESEND_CRUUSH_APP_AUDIENCE_ID: "synthetic-audience",
  RESEND_API_KEY: "synthetic-provider-key",
  CORS_ORIGIN: "https://cruush.test",
  APP_URL: "https://cruush.test",
  DATABASE_URL: "postgres://unused.test/synthetic",
  PORT: 3001,
  HOST: "127.0.0.1"
} as AppConfig;
const token = createNewsletterUnsubscribeToken(config, CONTACT_ID);
const apps: FastifyInstance[] = [];

function createApp(overrides: Partial<AppConfig> = {}, captureLogs?: string[]) {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const app = buildServer({ ...config, ...overrides }, {
    db: { query, end: vi.fn().mockResolvedValue(undefined) },
    rateLimiter: createMemoryRateLimiter(),
    logger: captureLogs ? {
      stream: new Writable({ write(chunk, _encoding, done) { captureLogs.push(String(chunk)); done(); } })
    } : false
  });
  apps.push(app);
  return { app, query };
}

function post(app: FastifyInstance, suppliedToken = token, body = "List-Unsubscribe=One-Click", origin?: string) {
  return app.inject({
    method: "POST",
    url: `${NEWSLETTER_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(suppliedToken)}`,
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
    payload: body
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("newsletter unsubscribe capability", () => {
  it("uses opaque contact identity, stable audience binding, distinct HMAC purpose, and HTTPS-only URL generation", () => {
    expect(readNewsletterUnsubscribeToken(config, token)).toBe(CONTACT_ID);
    expect(createNewsletterUnsubscribeToken(config, CONTACT_ID)).toBe(token);
    expect(readNewsletterUnsubscribeToken({ ...config, RESEND_CRUUSH_APP_AUDIENCE_ID: "another-audience" }, token)).toBeNull();
    expect(readNewsletterUnsubscribeToken({ ...config, SESSION_SECRET: "a-different-synthetic-secret-for-test-only" }, token)).toBeNull();
    const differentPurpose = createHmac("sha256", deriveKey(config.SESSION_SECRET, "session", "v2"))
      .update(`cruush:newsletter-unsubscribe:v1:${config.RESEND_CRUUSH_APP_AUDIENCE_ID}:${CONTACT_ID}`)
      .digest("base64url");
    expect(readNewsletterUnsubscribeToken(config, `v1.${CONTACT_ID}.${differentPurpose}`)).toBeNull();
    const url = new URL(createNewsletterUnsubscribeUrl(config, CONTACT_ID, "https://api.cruush.test"));
    expect(url.origin).toBe("https://api.cruush.test");
    expect(url.pathname).toBe(NEWSLETTER_UNSUBSCRIBE_PATH);
    expect(url.searchParams.get("token")).toBe(token);
    expect(url.toString()).not.toContain("@");
    for (const origin of ["http://api.cruush.test", "https://api.cruush.test/path", "https://user@api.cruush.test", "https://api.cruush.test?other=value"]) {
      expect(() => createNewsletterUnsubscribeUrl(config, CONTACT_ID, origin)).toThrow("newsletter_unsubscribe_requires_https_origin");
    }
    expect(() => createNewsletterUnsubscribeToken(config, "member@example.test")).toThrow("invalid_newsletter_contact_id");
    expect(() => createNewsletterUnsubscribeToken({ ...config, SESSION_SECRET: "short" }, CONTACT_ID)).toThrow("newsletter_unsubscribe_not_configured");
  });

  it("GET and HEAD show a confirmation form without provider or database mutation, and protect token exposure", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { app, query } = createApp();
    const response = await app.inject({ method: "GET", url: `${NEWSLETTER_UNSUBSCRIBE_PATH}?token=${token}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<form method="post"');
    expect(response.body).toContain('name="token"');
    expect(response.body).toContain('name="List-Unsubscribe" value="One-Click"');
    expect(response.body).toContain('type="submit">Unsubscribe</button>');
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toContain("form-action 'self'");
    expect(response.headers["x-robots-tag"]).toContain("noindex");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).not.toContain("<script");
    const head = await app.inject({ method: "HEAD", url: `${NEWSLETTER_UNSUBSCRIBE_PATH}?token=${token}` });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects unsigned, tampered, wrong-namespace, malformed and duplicate tokens before any provider write", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { app, query } = createApp();
    const invalidTokens = ["", CONTACT_ID, "session." + token, token.replace(CONTACT_ID, OTHER_CONTACT_ID), token.replace("v1.", "v2."), token.slice(0, -1), `${token}.extra`, '<img src=x onerror="alert(1)">'];
    for (const invalid of invalidTokens) {
      const response = await post(app, invalid);
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain("onerror");
      expect(response.body).not.toContain("unsubscribed from");
    }
    const duplicate = await app.inject({ method: "POST", url: `${NEWSLETTER_UNSUBSCRIBE_PATH}?token=${token}&token=${token}`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "List-Unsubscribe=One-Click" });
    expect(duplicate.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("performs RFC8058 one-click POST without Origin, auth, cookie, redirect or further confirmation; repeat requests only set the same flag", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const { app, query } = createApp();
    for (let index = 0; index < 2; index += 1) {
      const response = await post(app);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("");
      expect(response.headers.location).toBeUndefined();
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe(`https://api.resend.com/contacts/${CONTACT_ID}`);
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ unsubscribed: true });
      expect(init.headers).toEqual({ Authorization: "Bearer synthetic-provider-key", "Content-Type": "application/json" });
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("manual confirmation submits the hidden capability and returns a receipt without changing other contact fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { app } = createApp();
    const response = await app.inject({ method: "POST", url: NEWSLETTER_UNSUBSCRIBE_PATH, headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://api.cruush.test" }, payload: new URLSearchParams({ token, "List-Unsubscribe": "One-Click" }).toString() });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("You are unsubscribed from cruush newsletters");
    expect(response.body).not.toContain(token);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ unsubscribed: true });
  });

  it("accepts RFC8058 multipart forms while rejecting conflicting, duplicate, missing or arbitrary actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { app } = createApp();
    const multipart = await app.inject({ method: "POST", url: `${NEWSLETTER_UNSUBSCRIBE_PATH}?token=${token}`, headers: { "content-type": "multipart/form-data; boundary=newsletter-synthetic-boundary" }, payload: '--newsletter-synthetic-boundary\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--newsletter-synthetic-boundary--\r\n' });
    expect(multipart.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const payload of ["", "List-Unsubscribe=No", "List-Unsubscribe=One-Click&List-Unsubscribe=One-Click", "List-Unsubscribe=One-Click&email=victim%40example.test", `List-Unsubscribe=One-Click&token=${createNewsletterUnsubscribeToken(config, OTHER_CONTACT_ID)}`]) {
      expect((await post(app, token, payload)).statusCode).toBe(400);
    }
    const json = await app.inject({ method: "POST", url: `${NEWSLETTER_UNSUBSCRIBE_PATH}?token=${token}`, payload: { "List-Unsubscribe": "One-Click" } });
    expect(json.statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ordinary API routes retain their production Origin checks; an unsubscribe token cannot bypass them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { app } = createApp();
    for (const headers of [{}, { origin: "https://attacker.test" }]) {
      const response = await app.inject({ method: "POST", url: `/api/auth/login?token=${token}`, headers, payload: { email: "synthetic@example.test", password: "synthetic" } });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
    }
    const unknown = await app.inject({ method: "POST", url: `${NEWSLETTER_UNSUBSCRIBE_PATH}/extra?token=${token}` });
    expect(unknown.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 500])("does not claim unsubscribe success on provider status %s or expose provider response data", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('provider body contains synthetic-contact@example.test', { status })));
    const { app } = createApp();
    const response = await post(app);
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.body).toContain("Unsubscribe temporarily unavailable");
    expect(response.body).not.toContain("unsubscribed from");
    expect(response.body).not.toContain("synthetic-contact");
    expect(response.body).not.toContain(CONTACT_ID);
  });

  it("does not emit signed URLs, contact IDs, API keys or fetch exception data in request/provider logs", async () => {
    const lines: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`secret URL https://api.resend.com/contacts/${CONTACT_ID} synthetic-contact@example.test synthetic-provider-key`)));
    const { app } = createApp({}, lines);
    const response = await post(app);
    expect(response.statusCode).toBe(503);
    await app.close();
    const logs = lines.join("");
    expect(logs).toContain(NEWSLETTER_UNSUBSCRIBE_PATH);
    expect(logs).toContain("provider_request_failed");
    for (const secret of [token, CONTACT_ID, "synthetic-contact@example.test", "synthetic-provider-key", "https://api.resend.com/contacts/"]) {
      expect(logs).not.toContain(secret);
    }
  });

  it("fails safely without provider config and bounds repeated provider writes per signed recipient", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const unconfigured = createApp({ RESEND_API_KEY: "" }).app;
    expect((await post(unconfigured)).statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    const { app } = createApp();
    for (let index = 0; index < 10; index += 1) expect((await post(app)).statusCode).toBe(200);
    const limited = await post(app);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
