import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { DEVELOPMENT_ADMIN_LOCATION } from "./development-admin.js";
import {
  TEST_PROFILE_COUNT,
  assertDevelopmentSeedConfig,
  buildDevelopmentTestProfiles,
  seedDevelopmentProfilesWithDb
} from "./dev-seed-profiles.js";
import { createCoarseIndexTokens } from "./location-privacy.js";

const config: AppConfig = {
  NODE_ENV: "development",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  RESEND_API_KEY: "",
  MAIL_FROM: "",
  EMAIL_PREVIEW_ENABLED: true,
  DEVELOPMENT_ADMIN_ENABLED: true,
  DEVELOPMENT_ADMIN_PASSWORD: "admin-password",
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
  MATCH_TOKEN_KEY_VERSION: "v1",
  LOCATION_ENCRYPTION_KEY: "location-encryption-key-32-bytes",
  LOCATION_INDEX_KEY: "location-index-key-32-bytes-long",
  VISIBILITY_POLICY_ENCRYPTION_KEY: "visibility-policy-key-32-bytes",
  GHOST_DERIVATION_KEY: "ghost-derivation-key-32-bytes-ok",
  DISPLAY_TOKEN_ENCRYPTION_KEY: "display-token-key-32-bytes-long",
  LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  LOCATION_INDEX_KEY_VERSION: "v1",
  VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION: "v1",
  GHOST_DERIVATION_KEY_VERSION: "v1",
  DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION: "v1"
};

function seededUserId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("development profile seeding", () => {
  it("builds twenty deterministic NYC test profiles", () => {
    const profiles = buildDevelopmentTestProfiles(new Date("2026-06-01T12:00:00.000Z"));
    const emails = new Set(profiles.map((profile) => profile.email));

    expect(profiles).toHaveLength(TEST_PROFILE_COUNT);
    expect(emails.size).toBe(TEST_PROFILE_COUNT);
    expect(profiles[0]).toMatchObject({
      email: "test-cruush-01@cruush.local",
      displayName: "jay",
      lat: 40.7041,
      lng: -74.0172
    });
    expect(profiles.at(-1)).toMatchObject({
      email: "test-cruush-20@cruush.local",
      displayName: "ren",
      lat: 40.7121,
      lng: -73.9812
    });
    expect(new Set(profiles.map((profile) => profile.lat.toFixed(4))).size).toBeGreaterThan(15);
    expect(new Set(profiles.map((profile) => profile.lng.toFixed(4))).size).toBeGreaterThan(15);
    expect(profiles.every((profile) => profile.photo.startsWith("data:image/svg+xml,"))).toBe(true);
    expect(profiles.every((profile) => profile.lat >= 40.35 && profile.lat <= 41.08)).toBe(true);
    expect(profiles.every((profile) => profile.lng >= -74.65 && profile.lng <= -73.45)).toBe(true);
    expect(profiles.some((profile) => profile.sensitiveProfile.crowds.includes("T4T"))).toBe(true);
    expect(profiles[1].updatedAt.getTime()).toBeLessThan(profiles[0].updatedAt.getTime());
  });

  it("refuses production or disabled dev-admin configs", () => {
    expect(() => assertDevelopmentSeedConfig({
      NODE_ENV: "production",
      DEVELOPMENT_ADMIN_ENABLED: true,
      DEVELOPMENT_ADMIN_PASSWORD: "admin-password"
    })).toThrow(/production/i);

    expect(() => assertDevelopmentSeedConfig({
      NODE_ENV: "development",
      DEVELOPMENT_ADMIN_ENABLED: false,
      DEVELOPMENT_ADMIN_PASSWORD: "admin-password"
    })).toThrow(/DEVELOPMENT_ADMIN_ENABLED/);

    expect(() => assertDevelopmentSeedConfig({
      NODE_ENV: "development",
      DEVELOPMENT_ADMIN_ENABLED: true,
      DEVELOPMENT_ADMIN_PASSWORD: "admin-password"
    })).not.toThrow();
  });

  it("syncs the admin and all test profiles into encrypted location discovery", async () => {
    let userIndex = 0;
    let relationshipIndex = 0;
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalizedSql = sql.toLowerCase();

      if (normalizedSql.includes("insert into app_users")) {
        userIndex += 1;

        return {
          rows: [{
            id: seededUserId(userIndex),
            email: params[0],
            display_name: params[2],
            email_verified_at: "2026-06-01T12:00:00.000Z",
            created_at: "2026-06-01T12:00:00.000Z"
          }]
        };
      }

      if (normalizedSql.includes("insert into encrypted_relationship_records")) {
        relationshipIndex += 1;

        return {
          rows: [{
            id: `relationship-${relationshipIndex}`
          }]
        };
      }

      return {
        rows: []
      };
    });
    const db = {
      query,
      end: vi.fn()
    } as unknown as DbClient;

    const result = await seedDevelopmentProfilesWithDb({ config, db });
    const encryptedLocationCalls = query.mock.calls.filter(([sql]) => String(sql).includes("insert into encrypted_location_envelopes"));
    const encryptedPolicyCalls = query.mock.calls.filter(([sql]) => String(sql).includes("insert into encrypted_visibility_tokens"));
    const legacyPrivacyCalls = query.mock.calls.filter(([sql]) => String(sql).includes("insert into user_privacy_settings"));
    const adminDiscoveryTokens = new Set(createCoarseIndexTokens(
      config,
      DEVELOPMENT_ADMIN_LOCATION.lat,
      DEVELOPMENT_ADMIN_LOCATION.lng
    ));
    const seededProfileLocationCalls = encryptedLocationCalls.filter(([, params]) => {
      const subjectUserId = ((params ?? []) as unknown[])[0];
      return subjectUserId !== seededUserId(1);
    });

    expect(result.profileCount).toBe(TEST_PROFILE_COUNT);
    expect(encryptedLocationCalls).toHaveLength(TEST_PROFILE_COUNT + 1);
    expect(seededProfileLocationCalls).toHaveLength(TEST_PROFILE_COUNT);
    expect(encryptedPolicyCalls).toHaveLength(TEST_PROFILE_COUNT + 1);
    expect(legacyPrivacyCalls).toHaveLength(TEST_PROFILE_COUNT);
    for (const [, params] of seededProfileLocationCalls) {
      const coarseIndexTokens = (((params ?? []) as unknown[])[9] ?? []) as string[];
      expect(coarseIndexTokens.some((token) => adminDiscoveryTokens.has(token))).toBe(true);
    }
    expect(JSON.stringify(encryptedLocationCalls.map(([, params]) => params))).not.toContain("40.7041");
    expect(JSON.stringify(encryptedLocationCalls.map(([, params]) => params))).not.toContain("-74.0172");
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase() === "commit")).toBe(true);
  });
});
