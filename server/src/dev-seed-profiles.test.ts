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
import {
  deleteEncryptedMediaObject,
  writeEncryptedMediaObject
} from "./media-storage.js";

vi.mock("./media-storage.js", async () => {
  const actual = await vi.importActual<typeof import("./media-storage.js")>("./media-storage.js");

  return {
    ...actual,
    deleteEncryptedMediaObject: vi.fn(async () => undefined),
    writeEncryptedMediaObject: vi.fn(async () => undefined)
  };
});

const config: AppConfig = {
  NODE_ENV: "development",
  PORT: 3001,
  HOST: "127.0.0.1",
  DATABASE_URL: "postgres://localhost:5432/cruush",
  CORS_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: "test-secret",
  APP_URL: "https://cruush.test",
  MEDIA_STORAGE_DIR: "media",
  MEDIA_OBJECT_STORAGE_DRIVER: "local",
  MEDIA_ENCRYPTION_KEY: "test-media-encryption-key-32-bytes",
  MEDIA_ENCRYPTION_KEY_VERSION: "v1",
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
    vi.mocked(deleteEncryptedMediaObject).mockClear();
    vi.mocked(writeEncryptedMediaObject).mockClear();
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

      if (
        normalizedSql.includes("from media_objects") &&
        normalizedSql.includes("surface = 'profile_photo'")
      ) {
        return {
          rows: [{
            public_url: "/api/media/profile-photos/existing.png",
            object_key: "profile-photos/existing.png.enc"
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
    const mediaObjectCalls = query.mock.calls.filter(([sql]) => String(sql).includes("insert into media_objects"));
    const profileCalls = query.mock.calls.filter(([sql]) => (
      String(sql).includes("insert into profiles") && String(sql).includes("profile_sensitive_ciphertext")
    ));
    const adminPhotoCalls = query.mock.calls.filter(([sql]) => String(sql).includes("set photos = $2"));
    const legacyPrivacyCalls = query.mock.calls.filter(([sql]) => String(sql).includes(
      "insert into user_privacy_settings (user_id, ghost_mode_enabled, precise_location_visibility)"
    ));
    const travelPinCalls = query.mock.calls.filter(([sql]) => String(sql).includes(
      "insert into user_travel_pins"
    ));
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
    expect(encryptedPolicyCalls).toHaveLength((TEST_PROFILE_COUNT + 1) * 2);
    expect(legacyPrivacyCalls).toHaveLength(TEST_PROFILE_COUNT);
    expect(travelPinCalls).toHaveLength(3);
    expect(travelPinCalls.map(([, params]) => ((params ?? []) as unknown[])[3])).toEqual([
      "In from Chicago",
      "In from Los Angeles",
      "In from Atlanta"
    ]);
    // Each seeded profile carries a small gallery, so the side previews on a
    // profile have something to show locally.
    expect(mediaObjectCalls).toHaveLength((TEST_PROFILE_COUNT + 1) * 3);
    expect(profileCalls).toHaveLength(TEST_PROFILE_COUNT);
    expect(adminPhotoCalls).toHaveLength(1);
    expect(((adminPhotoCalls[0]?.[1] ?? []) as unknown[]).slice(0, 2)).toEqual([
      seededUserId(1),
      Array.from({ length: 3 }, () => expect.stringMatching(/^\/api\/media\/profile-photos\/[0-9a-f-]+\.png$/))
    ]);
    expect(deleteEncryptedMediaObject).toHaveBeenCalledTimes((TEST_PROFILE_COUNT + 1) * 3);
    expect(writeEncryptedMediaObject).toHaveBeenCalledTimes((TEST_PROFILE_COUNT + 1) * 3);
    for (const [, params] of profileCalls) {
      expect(((params ?? []) as unknown[])[2]).toEqual(Array.from({ length: 3 }, () => expect.stringMatching(/^\/api\/media\/profile-photos\/[0-9a-f-]+\.png$/)));
    }
    for (const [, params] of seededProfileLocationCalls) {
      const coarseIndexTokens = (((params ?? []) as unknown[])[9] ?? []) as string[];
      expect(coarseIndexTokens.some((token) => adminDiscoveryTokens.has(token))).toBe(true);
    }
    expect(JSON.stringify(encryptedLocationCalls.map(([, params]) => params))).not.toContain("40.7041");
    expect(JSON.stringify(encryptedLocationCalls.map(([, params]) => params))).not.toContain("-74.0172");
    expect(query.mock.calls.some(([sql]) => String(sql).toLowerCase() === "commit")).toBe(true);
  });
});
