import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSinnersWelcomeEmail } from "./mailer.js";
import type { AppConfig } from "./config.js";

const config = { APP_URL: "https://cruush.test/", RESEND_API_KEY: "synthetic", MAIL_FROM: "cruush <hello@cruush.test>" } as AppConfig;
const logger = { error: vi.fn() } as unknown as Parameters<typeof sendSinnersWelcomeEmail>[0]["logger"];
const input = { config, logger, email: "synthetic@example.invalid", idempotencyKey: "sinners-welcome/return/synthetic" };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Sinners welcome mailer", () => {
  it("sends the approved exact wording with bounded stable-key delivery and a transactional footer", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "synthetic-provider" }) });
    vi.stubGlobal("fetch", fetch);
    expect(await sendSinnersWelcomeEmail(input)).toEqual({ accepted: true, providerMessageId: "synthetic-provider" });
    const options = fetch.mock.calls[0]![1];
    const body = JSON.parse(options.body);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers["Idempotency-Key"]).toBe(input.idempotencyKey);
    expect(body.to).toEqual([input.email]);
    expect(body.subject).toBe("welcome to the Sinner's Map");
    const paragraphs = [
      "You signed the cruush Code of Conduct. In the old language, that means your soul is now marked for the Sinner's Map. If you are returning from Purgatory, welcome back. The gates noticed you made it home.",
      "cruush is a technopagan occult artifact powered by sex magic. You are not merely opening an app. You are crossing the threshold into the Feed, Clubs, Crowds, Cruise Carousel, and everything else waiting beyond the oath.",
      "Be honest. Respect boundaries. Keep private things private. Do not spoof your location. Location spoofing is a reportable violation, and accounts caught doing it will be banned. The Sinner's Map has many mysteries. Fake GPS coordinates are not one of them.",
      "You have been welcomed, witnessed, and technically warned. Try to behave."
    ];
    for (const paragraph of paragraphs) {
      expect(body.text).toContain(paragraph);
      expect(body.html).toContain(paragraph);
    }
    expect(body.html).toContain("the oath is sealed");
    expect(body.html).toContain("backdrop-filter:blur(22px)");
    expect(body.html).toContain('href="https://cruush.test/settings"');
    expect(body.html).toContain("Enter cruush");
    expect(body.html).toContain("xoxo,<br />Julien Lenaz<br />lead developer of cruush 🖤");
    expect(body.html).toContain('mailto:hello@cruush.app');
    expect(JSON.stringify(body)).not.toMatch(/UNSUBSCRIBE|Unsubscribe|Sinner’s|cruush is an occult item/);
  });

  it("does not contact a provider without credentials", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await sendSinnersWelcomeEmail({ ...input, config: { ...config, RESEND_API_KEY: "" } }))
      .toEqual({ accepted: false, providerMessageId: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("redacts recipient and provider content from failed-delivery logs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(sendSinnersWelcomeEmail(input)).rejects.toThrow("Failed to send email");
    expect(logger.error).toHaveBeenCalledWith({ statusCode: 503 }, "Sinners welcome email delivery failed");
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(input.email);
  });
});
