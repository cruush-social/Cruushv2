import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";
import type { AppConfig } from "./config.js";
import type { ProfilePayload } from "./profile-schema.js";

export type SensitiveProfileData = Pick<
  ProfilePayload,
  | "is_trans"
  | "crowds"
  | "kinks"
  | "kink_interests"
  | "hiv_status"
  | "custom_hiv_status"
>;

export type EncryptedSensitiveProfile = {
  profile_sensitive_ciphertext: string;
  profile_sensitive_nonce: string;
  profile_sensitive_auth_tag: string;
  profile_sensitive_key_version: string;
  profile_sensitive_token_key_version: string;
};

export type SensitiveProfileToken = {
  token_hash: string;
  token_key_version: string;
};

export const CROWD_OPTIONS = ["T4T", "Sapphic", "Gay"] as const;

function isCrowdOption(value: unknown): value is SensitiveProfileData["crowds"][number] {
  return typeof value === "string" && CROWD_OPTIONS.includes(value as SensitiveProfileData["crowds"][number]);
}

function normalizeTokenValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getProfileEncryptionSecret(config: AppConfig) {
  return config.PROFILE_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function getProfileTokenSecret(config: AppConfig) {
  return config.PROFILE_TOKEN_KEY || config.SESSION_SECRET;
}

function deriveKey(secret: string, purpose: string, keyVersion: string) {
  return createHash("sha256")
    .update(`${purpose}:${keyVersion}:${secret}`)
    .digest();
}

export function getSensitiveProfileKeyVersion(_config: AppConfig) {
  return "v1";
}

export function getSensitiveProfileTokenKeyVersion(config: AppConfig) {
  return config.PROFILE_TOKEN_KEY_VERSION || "v1";
}

export function encryptSensitiveProfile(
  config: AppConfig,
  sensitiveProfile: SensitiveProfileData
): EncryptedSensitiveProfile {
  const keyVersion = getSensitiveProfileKeyVersion(config);
  const tokenKeyVersion = getSensitiveProfileTokenKeyVersion(config);
  const key = deriveKey(getProfileEncryptionSecret(config), "profile-sensitive", keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const plaintext = JSON.stringify(sensitiveProfile);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  return {
    profile_sensitive_ciphertext: ciphertext.toString("base64"),
    profile_sensitive_nonce: nonce.toString("base64"),
    profile_sensitive_auth_tag: cipher.getAuthTag().toString("base64"),
    profile_sensitive_key_version: keyVersion,
    profile_sensitive_token_key_version: tokenKeyVersion
  };
}

export function decryptSensitiveProfile(
  config: AppConfig,
  encryptedProfile: {
    profile_sensitive_ciphertext?: string | null;
    profile_sensitive_nonce?: string | null;
    profile_sensitive_auth_tag?: string | null;
    profile_sensitive_key_version?: string | null;
  }
): SensitiveProfileData | null {
  if (
    !encryptedProfile.profile_sensitive_ciphertext ||
    !encryptedProfile.profile_sensitive_nonce ||
    !encryptedProfile.profile_sensitive_auth_tag
  ) {
    return null;
  }

  const keyVersion = encryptedProfile.profile_sensitive_key_version || getSensitiveProfileKeyVersion(config);
  const key = deriveKey(getProfileEncryptionSecret(config), "profile-sensitive", keyVersion);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encryptedProfile.profile_sensitive_nonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(encryptedProfile.profile_sensitive_auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedProfile.profile_sensitive_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<SensitiveProfileData>;

  return {
    is_trans: typeof parsed.is_trans === "boolean" ? parsed.is_trans : null,
    crowds: Array.isArray(parsed.crowds) ? parsed.crowds.filter(isCrowdOption) : [],
    kinks: Array.isArray(parsed.kinks) ? parsed.kinks.filter((value): value is string => typeof value === "string") : [],
    kink_interests: Array.isArray(parsed.kink_interests) ? parsed.kink_interests as SensitiveProfileData["kink_interests"] : [],
    hiv_status: Array.isArray(parsed.hiv_status) ? parsed.hiv_status.filter((value): value is string => typeof value === "string") : [],
    custom_hiv_status: typeof parsed.custom_hiv_status === "string" ? parsed.custom_hiv_status : ""
  };
}

export function createSensitiveProfileToken(
  config: AppConfig,
  tokenValue: string,
  tokenKeyVersion = getSensitiveProfileTokenKeyVersion(config)
): SensitiveProfileToken {
  return {
    token_hash: createHmac("sha256", deriveKey(getProfileTokenSecret(config), "profile-token", tokenKeyVersion))
      .update(tokenValue)
      .digest("hex"),
    token_key_version: tokenKeyVersion
  };
}

export function createSensitiveProfileTokens(
  config: AppConfig,
  sensitiveProfile: SensitiveProfileData
): SensitiveProfileToken[] {
  const tokenValues = new Set<string>();

  if (sensitiveProfile.is_trans === true) {
    tokenValues.add("trans:true");
  }

  for (const crowd of sensitiveProfile.crowds) {
    const normalizedCrowd = normalizeTokenValue(crowd);

    if (normalizedCrowd) {
      tokenValues.add(`crowd:${normalizedCrowd}`);
    }
  }

  for (const kink of sensitiveProfile.kink_interests.length > 0
    ? sensitiveProfile.kink_interests.map((interest) => interest.kink_id)
    : sensitiveProfile.kinks) {
    const normalizedKink = normalizeTokenValue(kink);

    if (normalizedKink) {
      tokenValues.add(`kink:${normalizedKink}`);
    }
  }

  for (const hivStatus of sensitiveProfile.hiv_status) {
    const normalizedHivStatus = normalizeTokenValue(hivStatus);

    if (normalizedHivStatus) {
      tokenValues.add(`hiv:${normalizedHivStatus}`);
    }
  }

  return [...tokenValues].map((tokenValue) => createSensitiveProfileToken(config, tokenValue));
}

export function createCrowdTokens(config: AppConfig, crowds: string[]) {
  return crowds
    .map((crowd) => normalizeTokenValue(crowd))
    .filter(Boolean)
    .map((crowd) => createSensitiveProfileToken(config, `crowd:${crowd}`));
}
