import { describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail, sendVerificationEmail } from "./mailer.js";
import type { AppConfig } from "./config.js";

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

describe("mailer", () => {
  it("escapes verification URLs before embedding them in HTML email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendVerificationEmail({
      config,
      email: "user@example.com",
      logger,
      verificationUrl: "https://cruush.test/?verifyEmailToken=abc&next=\" onclick=\"alert(1)"
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.html).toContain("abc&amp;next=&quot; onclick=&quot;alert(1)");
    expect(body.html).not.toContain("onclick=\"alert(1)");
    expect(body.text).toContain("onclick=\"alert(1)");
  });

  it("escapes password reset URLs before embedding them in HTML email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendPasswordResetEmail({
      config,
      email: "user@example.com",
      logger,
      resetUrl: "https://cruush.test/?resetPasswordToken=abc&next=<script>alert(1)</script>"
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.html).toContain("abc&amp;next=&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body.html).not.toContain("<script>");
    expect(body.text).toContain("<script>alert(1)</script>");
  });
});
