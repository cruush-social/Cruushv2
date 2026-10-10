import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import {
  createCrowdModeTokens,
  createCrowdTokens,
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
      crowds: ["T4T", "Dyke"],
      kinks: ["leather"],
      kink_interests: [{ kink_id: "leather", label: "Leather" }],
      hiv_status: ["undetectable"],
      custom_hiv_status: "",
      health_preferences: ["COVID tested", "Masks"],
      birth_control: [],
      relationship_status: []
    };
    const first = encryptSensitiveProfile(config, sensitiveProfile);
    const second = encryptSensitiveProfile(config, sensitiveProfile);

    expect(first.profile_sensitive_key_version).toBe("v2");
    expect(first.profile_sensitive_nonce).not.toBe(second.profile_sensitive_nonce);
    expect(first.profile_sensitive_ciphertext).not.toBe(second.profile_sensitive_ciphertext);
    expect(decryptSensitiveProfile(config, first)).toEqual(sensitiveProfile);
  });

  it("defaults legacy encrypted profiles to no health preferences", () => {
    const encrypted = encryptSensitiveProfile(config, {
      is_trans: false,
      crowds: [],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });

    expect(decryptSensitiveProfile(config, encrypted)?.health_preferences).toEqual([]);
  });

  it("fails closed when profile-sensitive ciphertext metadata is tampered", () => {
    const encrypted = encryptSensitiveProfile(config, {
      is_trans: true,
      crowds: ["T4T"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    });

    expect(decryptSensitiveProfile(config, {
      ...encrypted,
      profile_sensitive_auth_tag: Buffer.alloc(16).toString("base64")
    })).toBeNull();
    expect(decryptSensitiveProfile(config, {
      ...encrypted,
      profile_sensitive_key_version: "v1"
    })).toBeNull();
  });

  it("encrypts visibility rules with distinct nonces and fails closed on tampering", () => {
    const visibilityRules: ProfileVisibilityRules = {
      search_query: "",
      active_crowd_modes: ["T4T"],
      mile_high_club_members: false,
      members_without_photos: false,
      outside_service_area_members: true,
      age_range: [25, 45] as [number, number],
      distance: 25,
      identities: ["nonbinary"],
      presentations: [],
      looking_for: [],
      timing: [],
      hosting: [],
      preferred_spots: [],
      vibes: [],
      tags: ["private_visibility_tag"],
      crowds: [],
      hobbies: [],
      positions: [],
      roles: [],
      kinks: ["leather"],
      body_types: [],
      body_hair: [],
      pubic_hair: [],
      facial_hair: [],
      sexuality: [],
      zodiac: [],
      substance_boundaries: [],
      protection_boundaries: []
    };
    const first = encryptProfileVisibility(config, visibilityRules);
    const second = encryptProfileVisibility(config, visibilityRules);

    expect(first.profile_visibility_ciphertext).not.toContain("private_visibility_tag");
    expect(first.profile_visibility_key_version).toBe("v2");
    expect(first.profile_visibility_nonce).not.toBe(second.profile_visibility_nonce);
    expect(decryptProfileVisibility(config, first)).toEqual(visibilityRules);
    expect(decryptProfileVisibility(config, {
      ...first,
      profile_visibility_ciphertext: second.profile_visibility_ciphertext
    })).toBeNull();
  });

  it("normalizes legacy Sapphic crowd values while keeping old blind tokens matchable", () => {
    const legacySensitiveProfile = {
      is_trans: false,
      crowds: ["Sapphic"],
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    } as unknown as SensitiveProfileData;
    const legacyVisibilityRules = {
      active_crowd_modes: ["Sapphic"],
      age_range: null,
      distance: null,
      identities: [],
      presentations: [],
      looking_for: [],
      timing: [],
      hosting: [],
      preferred_spots: [],
      vibes: [],
      crowds: ["Sapphic"],
      hobbies: [],
      positions: [],
      roles: [],
      kinks: [],
      body_types: [],
      body_hair: [],
      pubic_hair: [],
      facial_hair: [],
      sexuality: [],
      zodiac: [],
      substance_boundaries: [],
      protection_boundaries: []
    } as unknown as ProfileVisibilityRules;

    expect(decryptSensitiveProfile(config, encryptSensitiveProfile(config, legacySensitiveProfile))?.crowds).toEqual(["Dyke"]);
    expect(decryptProfileVisibility(config, encryptProfileVisibility(config, legacyVisibilityRules))).toEqual({
      ...legacyVisibilityRules,
      search_query: "",
      active_crowd_modes: ["Dyke"],
      mile_high_club_members: false,
      members_without_photos: false,
      outside_service_area_members: false,
      crowds: ["Dyke"],
      tags: []
    });

    const dykeCrowdTokenHashes = new Set(createCrowdTokens(config, ["Dyke"]).map((token) => token.token_hash));
    const tokenBucketDate = new Date("2026-04-29T12:00:00.000Z");
    const dykeVisibilityTokenHashes = new Set(createCrowdModeTokens(config, ["Dyke"], tokenBucketDate).map((token) => token.token_hash));

    expect(dykeCrowdTokenHashes.has(createSensitiveProfileToken(config, "crowd:dyke").token_hash)).toBe(true);
    expect(dykeCrowdTokenHashes.has(createSensitiveProfileToken(config, "crowd:sapphic").token_hash)).toBe(true);
    expect(dykeVisibilityTokenHashes.has(createSensitiveProfileToken(config, "crowd-mode:dyke:2026-04-29").token_hash)).toBe(true);
    expect(dykeVisibilityTokenHashes.has(createSensitiveProfileToken(config, "crowd-mode:sapphic:2026-04-29").token_hash)).toBe(true);
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
