import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import {
  PLACE_FACILITY_TYPES,
  PLACE_TAGS,
  listPlacesQuerySchema,
  placeCheckinSchema,
  placeRatingSchema,
  storedPlaceSuggestionSchema
} from "./places.js";
import {
  decryptPlaceSuggestion,
  encryptPlaceSuggestion,
  placeSuggestionSupporterToken
} from "./place-suggestion-privacy.js";

const privacyConfig = {
  SESSION_SECRET: "spot-suggestion-session-secret",
  LOCATION_ENCRYPTION_KEY: "spot-suggestion-encryption-secret",
  LOCATION_ENCRYPTION_KEY_VERSION: "v7",
  LOCATION_INDEX_KEY: "spot-suggestion-index-secret",
  LOCATION_INDEX_KEY_VERSION: "v4"
} as AppConfig;

describe("Spot taxonomy", () => {
  it("accepts exactly the 27 approved facility categories", () => {
    expect(PLACE_FACILITY_TYPES).toHaveLength(27);
    expect(new Set(PLACE_FACILITY_TYPES).size).toBe(27);
    expect(PLACE_FACILITY_TYPES).toEqual(expect.arrayContaining(["adult_shop", "music_venue", "sports_venue", "retail", "woods", "rest_stop", "bridge"]));
    expect(PLACE_FACILITY_TYPES).not.toContain("venue");
    expect(storedPlaceSuggestionSchema.safeParse({
      name: "Legacy venue",
      description: "",
      latitude: 40.72,
      longitude: -73.98,
      address: "",
      facilityType: "venue",
      tags: []
    }).success).toBe(false);
  });

  it("keeps current stored tags and validates facility filters through the shared taxonomy", () => {
    expect(PLACE_TAGS).not.toEqual(expect.arrayContaining(["dyke_bar", "dyke_spot", "gay_spot", "t4t_spot", "leans_women"]));
    expect(listPlacesQuerySchema.parse({ facilityTypes: "bar,clinic" }).facilityTypes).toBe("bar,clinic");
  });

  it.each([
    "overall",
    "gender_inclusivity",
    "lgbtq_friendliness",
    "safety",
    "accessibility",
    "cleanliness"
  ])("accepts the %s Spot rating category", (category) => {
    expect(placeRatingSchema.parse({ category, stars: 5 })).toEqual({ category, stars: 5 });
  });

  it("rejects out-of-range stars and unknown rating categories", () => {
    expect(placeRatingSchema.safeParse({ category: "overall", stars: 0 }).success).toBe(false);
    expect(placeRatingSchema.safeParse({ category: "overall", stars: 6 }).success).toBe(false);
    expect(placeRatingSchema.safeParse({ category: "legacy", stars: 3 }).success).toBe(false);
  });
});

describe("Spot suggestion privacy", () => {
  it("round-trips suggestion fields without plaintext in the stored envelope", () => {
    const suggestion = {
      name: "Private proposed Spot",
      description: "Private review detail",
      latitude: 40.72,
      longitude: -73.98,
      address: "Private review address",
      facilityType: "bar",
      tags: []
    };
    const encrypted = encryptPlaceSuggestion(privacyConfig, suggestion);

    expect(JSON.stringify(encrypted)).not.toContain(suggestion.name);
    expect(JSON.stringify(encrypted)).not.toContain(suggestion.address);
    expect(encrypted.keyVersion).toBe("v7");
    expect(decryptPlaceSuggestion(privacyConfig, encrypted)).toEqual(suggestion);
  });

  it("uses stable scoped supporter tokens without exposing member IDs", () => {
    const first = placeSuggestionSupporterToken(privacyConfig, "place-a", "member-a");

    expect(first).toBe(placeSuggestionSupporterToken(privacyConfig, "place-a", "member-a"));
    expect(first).not.toBe(placeSuggestionSupporterToken(privacyConfig, "place-a", "member-b"));
    expect(first).not.toBe(placeSuggestionSupporterToken(privacyConfig, "place-b", "member-a"));
    expect(first).not.toContain("member-a");
  });
});

describe("Spot check-in contract", () => {
  it.each([1, 3, 6, 12, 24])("accepts a %sh board and check-in duration", (durationHours) => {
    expect(placeCheckinSchema.parse({
      content: "Meet by the entrance",
      durationHours,
      latitude: 40.72,
      longitude: -73.98,
      accuracyMeters: 10,
      observedAt: "2026-08-31T20:00:00.000Z"
    })).toMatchObject({ durationHours, visible: false });
  });

  it("rejects unsupported duration and imprecise location values", () => {
    expect(placeCheckinSchema.safeParse({
      content: "Meet by the entrance",
      durationHours: 8,
      visible: true,
      latitude: 40.72,
      longitude: -73.98,
      accuracyMeters: 10,
      observedAt: "2026-08-31T20:00:00.000Z"
    }).success).toBe(false);
    expect(placeCheckinSchema.safeParse({
      content: "Meet by the entrance",
      durationHours: 3,
      visible: true,
      latitude: 40.72,
      longitude: -73.98,
      accuracyMeters: 402.337,
      observedAt: "2026-08-31T20:00:00.000Z"
    }).success).toBe(false);
  });
});
