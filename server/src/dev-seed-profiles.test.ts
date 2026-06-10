import { describe, expect, it } from "vitest";
import {
  TEST_PROFILE_COUNT,
  assertDevelopmentSeedConfig,
  buildDevelopmentTestProfiles
} from "./dev-seed-profiles.js";

describe("development profile seeding", () => {
  it("builds twenty deterministic NYC test profiles", () => {
    const profiles = buildDevelopmentTestProfiles(new Date("2026-06-01T12:00:00.000Z"));
    const emails = new Set(profiles.map((profile) => profile.email));

    expect(profiles).toHaveLength(TEST_PROFILE_COUNT);
    expect(emails.size).toBe(TEST_PROFILE_COUNT);
    expect(profiles[0]).toMatchObject({
      email: "test-cruush-01@cruush.local",
      displayName: "jay",
      lat: 40.7336,
      lng: -74.0027
    });
    expect(profiles.at(-1)).toMatchObject({
      email: "test-cruush-20@cruush.local",
      displayName: "ren"
    });
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
});
