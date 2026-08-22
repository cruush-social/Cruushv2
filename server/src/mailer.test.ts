import { describe, expect, it, vi } from "vitest";
import {
  sendPasswordResetEmail,
  sendSupportRequestInboxEmail,
  sendUserReportInboxEmail,
  sendTrustSafetyAlertEmail,
  sendVerificationEmail
} from "./mailer.js";
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
  it("sends verification emails as real content, with the url escaped", async () => {
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
    // Resend's send endpoint has no template field. A payload carrying one has
    // no content and is rejected, which is how this mail went undelivered.
    expect(body).not.toHaveProperty("template");
    expect(typeof body.html).toBe("string");
    expect(typeof body.text).toBe("string");
    expect(body.html).toContain(
      "https://cruush.test/?verifyEmailToken=abc&amp;next=&quot; onclick=&quot;alert(1)"
    );
    expect(body.html).not.toContain('onclick="alert(1)"');
    expect(body.text).toContain("https://cruush.test/?verifyEmailToken=abc");
  });

  it("sends password reset emails as real content, with the url escaped", async () => {
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
    expect(body).not.toHaveProperty("template");
    expect(typeof body.html).toBe("string");
    expect(typeof body.text).toBe("string");
    expect(body.html).toContain(
      "https://cruush.test/?resetPasswordToken=abc&amp;next=&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(body.html).not.toContain("<script>alert(1)</script>");
    expect(body.text).toContain("https://cruush.test/?resetPasswordToken=abc");
  });

  it("sends PhotoDNA match alerts without evidence bytes or media object details", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendTrustSafetyAlertEmail({
      config: {
        ...config,
        TRUST_SAFETY_ALERT_EMAIL: "trust-safety@cruush.test"
      },
      logger,
      incident: {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
        userEmail: "river@example.com",
        surface: "profile_photo",
        environment: "test",
        testMode: true,
        providerRequestId: "photodna-match-1",
        createdAt: "2026-07-07T12:00:00.000Z",
        internalReviewUrl: "https://cruush.test/api/internal/csam-incidents/11111111-1111-4111-8111-111111111111"
      }
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.to).toEqual(["trust-safety@cruush.test"]);
    expect(body.subject).toBe("[TEST] PhotoDNA match incident 11111111-1111-4111-8111-111111111111");
    expect(body.html).toContain("photodna-match-1");
    expect(body.text).toContain("river@example.com");
    expect(body.html).not.toContain("object_key");
    expect(body.html).not.toContain("csam-evidence");
    expect(body.text).not.toContain("csam-evidence");
    expect(body.html).not.toContain("data:image");
  });

  it("sends support requests to the reports inbox with reply-to", async () => {
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

    expect(body.to).toEqual(["reports@cruush.app"]);
    expect(body.reply_to).toBe("founder@example.com");
    expect(body.subject).toBe("[support] question: Support inbox");
    expect(body.html).toContain("support-1");
    expect(body.text).toContain("Can AI answer most support questions?");
  });

  it("sends moderation reports to the reports inbox without target content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendUserReportInboxEmail({
      config,
      logger,
      report: {
        id: "report-1",
        createdAt: "2026-07-30T22:00:00.000Z",
        reporterUserId: "user-1",
        targetType: "profile",
        targetUserId: "user-2",
        conversationId: null,
        messageId: null,
        postId: null,
        mediaObjectId: null,
        profilePhotoUrl: null,
        reason: "harassment",
        details: "The profile is threatening people."
      }
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.to).toEqual(["reports@cruush.app"]);
    expect(body.subject).toBe("[report] profile: harassment");
    expect(body.html).toContain("report-1");
    expect(body.text).toContain("The profile is threatening people.");
    expect(body.html).not.toContain("reported plaintext");
    expect(body.text).not.toContain("reported plaintext");
  });
});

// Every Resend send must carry real content. The send endpoint takes html, text
// or react and has no template field, so a payload without a body is rejected
// and the mail silently never arrives. This covers the senders together so a
// future switch to templates cannot break delivery without failing a test.
describe("every Resend send carries real content", () => {
  const senders: Array<[string, () => Promise<unknown>]> = [
    ["verification", () => sendVerificationEmail({
      config,
      email: "user@example.com",
      logger,
      verificationUrl: "https://cruush.test/?verifyEmailToken=abc"
    })],
    ["password reset", () => sendPasswordResetEmail({
      config,
      email: "user@example.com",
      logger,
      resetUrl: "https://cruush.test/?resetPasswordToken=abc"
    })]
  ];

  for (const [name, send] of senders) {
    it(`${name} posts html and text, never a template`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      await send();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      expect(url).toBe("https://api.resend.com/emails");

      const body = JSON.parse(init.body);
      expect(body).not.toHaveProperty("template");
      expect(body.html, `${name} email has no html body`).toBeTruthy();
      expect(body.text, `${name} email has no text body`).toBeTruthy();
      expect(body.html.length).toBeGreaterThan(200);
      expect(body.to).toEqual(["user@example.com"]);
      expect(body.subject).toBeTruthy();
      expect(body.from).toBeTruthy();
    });
  }
});
