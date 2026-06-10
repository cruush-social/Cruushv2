import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes
} from "node:crypto";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";
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

export type ProfileVisibilityRules = ProfilePayload["visibility_rules"];

export type EncryptedProfileVisibility = {
  profile_visibility_ciphertext: string;
  profile_visibility_nonce: string;
  profile_visibility_auth_tag: string;
  profile_visibility_key_version: string;
  profile_visibility_token_key_version: string;
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

export function getSensitiveProfileKeyVersion(_config: AppConfig) {
  return "v2";
}

export function getProfileVisibilityKeyVersion(_config: AppConfig) {
  return "v2";
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

export function encryptProfileVisibility(
  config: AppConfig,
  visibilityRules: ProfileVisibilityRules
): EncryptedProfileVisibility {
  const keyVersion = getProfileVisibilityKeyVersion(config);
  const tokenKeyVersion = getSensitiveProfileTokenKeyVersion(config);
  const key = deriveKey(getProfileEncryptionSecret(config), "profile-visibility", keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const plaintext = JSON.stringify(visibilityRules);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  return {
    profile_visibility_ciphertext: ciphertext.toString("base64"),
    profile_visibility_nonce: nonce.toString("base64"),
    profile_visibility_auth_tag: cipher.getAuthTag().toString("base64"),
    profile_visibility_key_version: keyVersion,
    profile_visibility_token_key_version: tokenKeyVersion
  };
}

export function decryptProfileVisibility(
  config: AppConfig,
  encryptedProfile: {
    profile_visibility_ciphertext?: string | null;
    profile_visibility_nonce?: string | null;
    profile_visibility_auth_tag?: string | null;
    profile_visibility_key_version?: string | null;
  }
): ProfileVisibilityRules | null {
  if (
    !encryptedProfile.profile_visibility_ciphertext ||
    !encryptedProfile.profile_visibility_nonce ||
    !encryptedProfile.profile_visibility_auth_tag
  ) {
    return null;
  }

  const keyVersion = encryptedProfile.profile_visibility_key_version || getProfileVisibilityKeyVersion(config);
  const key = deriveKey(getProfileEncryptionSecret(config), "profile-visibility", keyVersion);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encryptedProfile.profile_visibility_nonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(encryptedProfile.profile_visibility_auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedProfile.profile_visibility_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<ProfileVisibilityRules>;

  return {
    active_crowd_modes: Array.isArray(parsed.active_crowd_modes) ? parsed.active_crowd_modes.filter(isCrowdOption) : [],
    age_range: Array.isArray(parsed.age_range) && parsed.age_range.length === 2 && parsed.age_range.every((value) => typeof value === "number")
      ? [parsed.age_range[0], parsed.age_range[1]]
      : null,
    distance: typeof parsed.distance === "number" ? parsed.distance : null,
    identities: Array.isArray(parsed.identities) ? parsed.identities.filter((value): value is string => typeof value === "string") : [],
    presentations: Array.isArray(parsed.presentations) ? parsed.presentations.filter((value): value is string => typeof value === "string") : [],
    looking_for: Array.isArray(parsed.looking_for) ? parsed.looking_for.filter((value): value is string => typeof value === "string") : [],
    timing: Array.isArray(parsed.timing) ? parsed.timing.filter((value): value is string => typeof value === "string") : [],
    hosting: Array.isArray(parsed.hosting) ? parsed.hosting.filter((value): value is string => typeof value === "string") : [],
    vibes: Array.isArray(parsed.vibes) ? parsed.vibes.filter((value): value is string => typeof value === "string") : [],
    crowds: Array.isArray(parsed.crowds) ? parsed.crowds.filter(isCrowdOption) : [],
    hobbies: Array.isArray(parsed.hobbies) ? parsed.hobbies.filter((value): value is string => typeof value === "string") : [],
    positions: Array.isArray(parsed.positions) ? parsed.positions.filter((value): value is string => typeof value === "string") : [],
    roles: Array.isArray(parsed.roles) ? parsed.roles.filter((value): value is string => typeof value === "string") : [],
    kinks: Array.isArray(parsed.kinks) ? parsed.kinks.filter((value): value is string => typeof value === "string") : [],
    body_types: Array.isArray(parsed.body_types) ? parsed.body_types.filter((value): value is string => typeof value === "string") : [],
    sexuality: Array.isArray(parsed.sexuality) ? parsed.sexuality.filter((value): value is string => typeof value === "string") : [],
    substance_boundaries: Array.isArray(parsed.substance_boundaries) ? parsed.substance_boundaries.filter((value): value is string => typeof value === "string") : []
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

function getCrowdModeTokenBuckets(now = new Date()) {
  const oneDayMs = 24 * 60 * 60 * 1000;

  return [now, new Date(now.getTime() - oneDayMs)].map((date) => date.toISOString().slice(0, 10));
}

export function createCrowdModeTokens(config: AppConfig, activeCrowdModes: string[], now = new Date()) {
  const tokenKeyVersion = getSensitiveProfileTokenKeyVersion(config);
  const tokenValues = new Set<string>();

  for (const crowdMode of activeCrowdModes) {
    const normalizedCrowdMode = normalizeTokenValue(crowdMode);

    if (!normalizedCrowdMode) {
      continue;
    }

    for (const bucket of getCrowdModeTokenBuckets(now)) {
      tokenValues.add(`crowd-mode:${normalizedCrowdMode}:${bucket}`);
    }
  }

  return [...tokenValues].map((tokenValue) => createSensitiveProfileToken(config, tokenValue, tokenKeyVersion));
}

export function createProfileVisibilityTokens(config: AppConfig, visibilityRules: ProfileVisibilityRules) {
  return createCrowdModeTokens(config, visibilityRules.active_crowd_modes);
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
