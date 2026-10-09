import { createCipheriv, randomBytes } from "node:crypto";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";
import type { PreparedSignupReferral } from "./referrals-service.js";

export type EncryptedReferralSignupPrivacy = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
};

type ReferralSignupPrivacyPayload = {
  referralCode: string;
  referrerUserId: string;
  status: PreparedSignupReferral["status"];
  riskScore: number;
  reviewFlags: string[];
  signupIpHash: string | null;
  signupDeviceHash: string | null;
  capturedAt: string;
};

function referralPrivacyKeyVersion() {
  return "v1";
}

export function encryptReferralSignupPrivacy(
  config: AppConfig,
  referral: PreparedSignupReferral,
  capturedAt = new Date()
): EncryptedReferralSignupPrivacy {
  const keyVersion = referralPrivacyKeyVersion();
  const key = deriveKey(config.SESSION_SECRET, "referral-signup-privacy", keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const payload: ReferralSignupPrivacyPayload = {
    referralCode: referral.code,
    referrerUserId: referral.referrerUserId,
    status: referral.status,
    riskScore: referral.riskScore,
    reviewFlags: referral.reviewFlags,
    signupIpHash: referral.ipHash,
    signupDeviceHash: referral.deviceHash,
    capturedAt: capturedAt.toISOString()
  };
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion
  };
}
