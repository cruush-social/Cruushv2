import { describe, expect, it } from "vitest";
import { encryptReferralSignupPrivacy } from "./referral-privacy.js";
import type { AppConfig } from "./config.js";
import type { PreparedSignupReferral } from "./referrals-service.js";

describe("referral signup privacy", () => {
  const config = {
    SESSION_SECRET: "test-session-secret-for-referral-privacy-123456"
  } as AppConfig;
  const referral: PreparedSignupReferral = {
    code: "referral-code-123456",
    referrerUserId: "00000000-0000-4000-8000-000000000001",
    status: "pending",
    riskScore: 0,
    reviewFlags: [],
    ipHash: "ip-hmac",
    deviceHash: "device-hmac"
  };

  it("encrypts affiliate signup audit context without plaintext leakage", () => {
    const encrypted = encryptReferralSignupPrivacy(config, referral, new Date("2026-07-30T20:00:00.000Z"));
    const serialized = JSON.stringify(encrypted);

    expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encrypted.nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encrypted.authTag).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encrypted.keyVersion).toBe("v1");
    expect(serialized).not.toContain(referral.code);
    expect(serialized).not.toContain(referral.referrerUserId);
    expect(serialized).not.toContain("ip-hmac");
    expect(serialized).not.toContain("device-hmac");
  });
});
