import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import {
  createSensitiveProfileTokens,
  createSensitiveProfileToken,
  decryptProfileVisibility,
  decryptSensitiveProfile,
  encryptProfileVisibility,
  encryptSensitiveProfile,
  type ProfileVisibilityRules,
  type SensitiveProfileData
} from "./profile-sensitive.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret-for-profile-sensitive",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: false,
  DEVELOPMENT_ADMIN_PASSWORD: "",
  TURNSTILE_SECRET_KEY: "",
  PROFILE_ENCRYPTION_KEY: "profile-encryption-key-32-bytes",
  PROFILE_TOKEN_KEY: "profile-token-key-32-byte-value",
  PROFILE_TOKEN_KEY_VERSION: "v1",
  RELATIONSHIP_ENCRYPTION_KEY: "",
  RELATIONSHIP_INDEX_KEY: "",
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: "v1",
  RELATIONSHIP_INDEX_KEY_VERSION: "v1",
  MATCH_TOKEN_ENCRYPTION_KEY: "",
  MATCH_TOKEN_SIGNING_KEY: "",
  MATCH_TOKEN_KEY_VERSION: "v1"
};

describe("profile-sensitive encryption", () => {
  it("encrypts profile-sensitive fields with distinct nonces and decrypts by stored key version", () => {
    const sensitiveProfile: SensitiveProfileData = {
      is_trans: true,
      crowds: ["T4T", "Sapphic"],
      kinks: ["leather"],
      kink_interests: [{ kink_id: "leather", label: "Leather" }],
      hiv_status: ["undetectable"],
      custom_hiv_status: ""
    };
    const first = encryptSensitiveProfile(config, sensitiveProfile);
    const second = encryptSensitiveProfile(config, sensitiveProfile);

    expect(first.profile_sensitive_key_version).toBe("v2");
    expect(first.profile_sensitive_nonce).not.toBe(second.profile_sensitive_nonce);
    expect(first.profile_sensitive_ciphertext).not.toBe(second.profile_sensitive_ciphertext);
    expect(decryptSensitiveProfile(config, first)).toEqual(sensitiveProfile);
  });

  it("fails profile-sensitive decryption when ciphertext metadata is tampered", () => {
    const encrypted = encryptSensitiveProfile(config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });

    expect(() => decryptSensitiveProfile(config, {
      ...encrypted,
      profile_sensitive_auth_tag: Buffer.alloc(16).toString("base64")
    })).toThrow();
    expect(() => decryptSensitiveProfile(config, {
      ...encrypted,
      profile_sensitive_key_version: "v1"
    })).toThrow();
  });

  it("encrypts visibility rules with distinct nonces and rejects tampering", () => {
    const visibilityRules: ProfileVisibilityRules = {
      active_crowd_modes: ["T4T"],
      age_range: [25, 45] as [number, number],
      distance: 25,
      identities: ["nonbinary"],
      presentations: [],
      looking_for: [],
      timing: [],
      hosting: [],
      vibes: [],
      crowds: [],
      hobbies: [],
      positions: [],
      roles: [],
      kinks: ["leather"],
      body_types: [],
      sexuality: [],
      substance_boundaries: []
    };
    const first = encryptProfileVisibility(config, visibilityRules);
    const second = encryptProfileVisibility(config, visibilityRules);

    expect(first.profile_visibility_key_version).toBe("v2");
    expect(first.profile_visibility_nonce).not.toBe(second.profile_visibility_nonce);
    expect(decryptProfileVisibility(config, first)).toEqual(visibilityRules);
    expect(() => decryptProfileVisibility(config, {
      ...first,
      profile_visibility_ciphertext: second.profile_visibility_ciphertext
    })).toThrow();
  });

  it("keeps blind token key versions explicit and stable until index rotation is planned", () => {
    const first = createSensitiveProfileToken(config, "crowd:t4t");
    const second = createSensitiveProfileToken(config, "crowd:t4t");
    const rotated = createSensitiveProfileToken(config, "crowd:t4t", "v2");

    expect(first.token_key_version).toBe("v1");
    expect(first).toEqual(second);
    expect(rotated.token_key_version).toBe("v2");
    expect(rotated.token_hash).not.toBe(first.token_hash);
  });

  it("does not create filter tokens for HIV status or raw trans status", () => {
    const tokens = createSensitiveProfileTokens(config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: ["leather"],
      kink_interests: [{ kink_id: "leather", label: "Leather" }],
      hiv_status: ["undetectable"],
      custom_hiv_status: "private note"
    });

    const tokenHashes = new Set(tokens.map((token) => token.token_hash));

    expect(tokenHashes.has(createSensitiveProfileToken(config, "trans:true").token_hash)).toBe(false);
    expect(tokenHashes.has(createSensitiveProfileToken(config, "hiv:undetectable").token_hash)).toBe(false);
    expect(tokenHashes.has(createSensitiveProfileToken(config, "crowd:t4t").token_hash)).toBe(true);
    expect(tokenHashes.has(createSensitiveProfileToken(config, "kink:leather").token_hash)).toBe(true);
  });
});
