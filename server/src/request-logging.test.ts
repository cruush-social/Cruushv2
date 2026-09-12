import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createMemoryRateLimiter } from "./rate-limit.js";
import { sendEmailChangeConfirmationEmail, sendPasswordResetEmail, sendVerificationEmail } from "./mailer.js";
import { verifyTurnstileToken } from "./turnstile.js";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgres://localhost/cruush",
  SESSION_SECRET: "synthetic-test-secret-at-least-32-characters",
  APP_URL: "https://cruush.test",
  EMAIL_PREVIEW_ENABLED: "true"
});

function captureLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: { stream: new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } }) }
  };
}

describe("secret-free logging", () => {
  it("keeps route/status/timing without secrets on redirects, rejected requests, errors or health checks", async () => {
    const capture = captureLogger();
    const app = buildServer(config, {
      logger: capture.logger,
      db: { query: async () => ({ rows: [] }), end: async () => {} },
      rateLimiter: createMemoryRateLimiter()
    });
    const secret = "synthetic-log-leak-probe";
    app.get("/log-error", async (request) => { throw new Error(request.url); });
    try {
      for (const path of ["/reset-password", "/verify-email", "/confirm-email"]) {
        const response = await app.inject({
          url: `${path}?token=${secret}&futureSecret=${secret}&%76erifyEmailToken=${secret}`,
          headers: { authorization: `Bearer ${secret}`, cookie: `cruush_session=${secret}`, referer: `https://cruush.test/?token=${secret}` }
        });
        expect(response.statusCode).toBe(302);
        // Removing secrets from logs must not alter the link delivered to the browser.
        expect(response.headers.location).toContain(secret);
      }
      for (const key of ["resetPasswordToken", "verifyEmailToken", "confirmEmailToken", "futureSecret"]) {
        expect((await app.inject(`/?${key}=${secret}`)).statusCode).toBe(404);
      }
      expect((await app.inject(`/log-error?token=${secret}`)).statusCode).toBe(500);
      expect((await app.inject(`/unknown/${secret}`)).statusCode).toBe(404);
      expect((await app.inject({ method: "POST", url: "/api/auth/password/reset", payload: { token: secret, password: secret } })).statusCode).toBe(400);
      const lines = capture.lines.join("");
      expect(lines).not.toContain(secret);
      const records = capture.lines.map((line) => JSON.parse(line));
      expect(records.some((record) => record.req?.url === "/reset-password")).toBe(true);
      expect(records.some((record) => record.res?.statusCode === 302 && typeof record.responseTime === "number")).toBe(true);
      const beforeHealth = capture.lines.length;
      await app.inject("/health");
      expect(capture.lines.length).toBe(beforeHealth);
    } finally { await app.close(); }
  });

  it("returns development preview links without logging their token values", async () => {
    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const secret = "synthetic-preview-token";
    for (const [send, key] of [[sendVerificationEmail, "verificationUrl"], [sendPasswordResetEmail, "resetUrl"], [sendEmailChangeConfirmationEmail, "confirmUrl"]] as const) {
      const url = `https://cruush.test/?token=${secret}`;
      expect(await send({ config, logger, email: "test@example.invalid", [key]: url } as any)).toEqual({ previewUrl: url });
    }
    expect(logger.info).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(secret);
  });

  it("does not log provider errors that echo token-bearing email content", async () => {
    const secret = "synthetic-provider-echo-token";
    const logger = { info: vi.fn(), error: vi.fn() } as any;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => secret }));
    try {
      await expect(sendPasswordResetEmail({ config: { ...config, RESEND_API_KEY: "synthetic-key", MAIL_FROM: "test@example.invalid" }, email: "test@example.invalid", logger, resetUrl: `https://cruush.test/?token=${secret}` })).rejects.toThrow("Failed to send email.");
      expect(logger.error).toHaveBeenCalledWith({ email: "test@example.invalid", statusCode: 422 }, expect.any(String));
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain(secret);
      await expect(verifyTurnstileToken({ server: { config: { TURNSTILE_SECRET_KEY: secret } }, log: logger } as any, secret)).rejects.toThrow("Captcha verification failed.");
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain(secret);
    } finally { vi.unstubAllGlobals(); }
  });
});
