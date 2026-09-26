import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSubscriptionExpiryEmail,
  sendBitcoinMonitoringCapacityAlertEmail,
  sendPasswordResetEmail,
  sendSubscriptionExpiryEmail,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mailer", () => {
  it("sends Bitcoin monitoring capacity alerts to the owner email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendBitcoinMonitoringCapacityAlertEmail({
      activeAddresses: 40,
      config,
      level: "warning",
      logger
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(["julienlenazny@gmail.com"]);
    expect(body.subject).toBe("[WARNING] cruush Bitcoin monitoring capacity is near its limit");
    expect(body.text).toContain("Active checkout addresses: 40");
    expect(body.html).not.toContain("RESEND_API_KEY");
  });

  it("sends verification emails with the current Resend template", async () => {
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
    expect(body.template).toEqual({
      id: "0dc8f32c-76e2-45b2-aaf7-f4649ab48ab0",
      variables: {
        VERIFICATION_URL: "https://cruush.test/?verifyEmailToken=abc&amp;next=&quot; onclick=&quot;alert(1)"
      }
    });
    expect(body).not.toHaveProperty("html");
    expect(body).not.toHaveProperty("text");
  });

  it("sends password reset emails as inline html so Resend's publish state cannot change the design", async () => {
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

    // A referenced Resend template renders whatever revision was last published
    // there, which is invisible from here. The markup ships with the commit.
    expect(body).not.toHaveProperty("template");

    // The href carries the escaped url: an ampersand between query parameters
    // has to reach the attribute as &amp;, and the injected markup must not
    // survive into the document.
    expect(body.html).toContain(
      'href="https://cruush.test/?resetPasswordToken=abc&amp;next=&lt;script&gt;alert(1)&lt;/script&gt;"'
    );
    expect(body.html).not.toContain("<script>alert(1)</script>");

    // The text part carries the raw url, because an &amp; pasted into a browser
    // is a different address.
    expect(body.text).toContain("https://cruush.test/?resetPasswordToken=abc&next=<script>alert(1)</script>");
    expect(body.text).not.toContain("&amp;");
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

// A Resend send must carry something to render: a template, or html and text.
// It is carrying NEITHER that fails silently, because the route logs the error
// and still returns 202, so nothing surfaces to the user or to us.
describe("every Resend send carries something to render", () => {
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
    it(`${name} posts a template or a body, never neither`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      await send();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      expect(url).toBe("https://api.resend.com/emails");

      const body = JSON.parse(init.body);
      const hasTemplate = Boolean(body.template?.id);
      const hasBody = Boolean(body.html) && Boolean(body.text);
      expect(hasTemplate || hasBody, `${name} email would render nothing`).toBe(true);

      // a template has to carry its variables, or it renders with empty slots
      if (hasTemplate) {
        expect(Object.keys(body.template.variables ?? {}).length).toBeGreaterThan(0);
        for (const value of Object.values(body.template.variables)) {
          expect(String(value).length).toBeGreaterThan(0);
        }
      }

      expect(body.to).toEqual(["user@example.com"]);
      expect(body.subject).toBeTruthy();
      expect(body.from).toBeTruthy();
    });
  }
});

it("sends the subscription expiry date and renewal link with a stable provider idempotency key", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "email_accepted_1" }) });
  vi.stubGlobal("fetch", fetchMock);
  const payload = buildSubscriptionExpiryEmail({
    body: "Your cruush+ subscription expires on Sep 23, 2026, 4:00 PM UTC.",
    email: "member@example.invalid", from: config.MAIL_FROM, title: "cruush+ expires soon"
  });
  const input = { config, logger, payload, idempotencyKey: "subscription-expiry/test" };
  expect(await sendSubscriptionExpiryEmail(input)).toEqual({ accepted: true, providerMessageId: "email_accepted_1" });
  const request = fetchMock.mock.calls[0][1];
  expect(request.headers["Idempotency-Key"]).toBe(input.idempotencyKey);
  expect(JSON.parse(request.body)).toMatchObject({
    from: config.MAIL_FROM,
    subject: payload.subject,
    template: { id: "subscription-expiry", variables: { RENEW_URL: "https://cruush.app/store" } }
  });
  fetchMock.mockClear();
  expect(await sendSubscriptionExpiryEmail({ ...input, config: { ...config, RESEND_API_KEY: "" } })).toEqual({ accepted: false, providerMessageId: null });
  expect(fetchMock).not.toHaveBeenCalled();
});
