import { describe, expect, it } from "vitest";
import {
  ageFromDateOfBirth,
  emptyProfile,
  profileLocationPayloadSchema,
  profilePayloadSchema
} from "./profile-schema.js";

describe("profile schema", () => {
  it("accepts only the approved health preferences", () => {
    expect(profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      health_preferences: ["COVID tested", "Masks"]
    }).health_preferences).toEqual(["COVID tested", "Masks"]);

    expect(() => profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      health_preferences: ["Unapproved"]
    })).toThrow();
  });

  it("accepts up to three sexualities and trims older selections", () => {
    const parsed = profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      sexuality: ["gay", "queer", "pansexual", "bisexual"]
    });

    expect(parsed.sexuality).toEqual(["queer", "pansexual", "bisexual"]);
  });

  it("accepts only PING as the optional location sync reason", () => {
    const ordinaryLocation = profileLocationPayloadSchema.parse({
      lat: 40.711,
      lng: -74.002,
      fuzz_radius_meters: 50
    });
    const pingLocation = profileLocationPayloadSchema.parse({
      lat: 40.711,
      lng: -74.002,
      fuzz_radius_meters: 50,
      sync_reason: "PING"
    });

    expect(ordinaryLocation).not.toHaveProperty("sync_reason");
    expect(pingLocation.sync_reason).toBe("PING");
    expect(() => profileLocationPayloadSchema.parse({
      lat: 40.711,
      lng: -74.002,
      sync_reason: "BACKGROUND"
    })).toThrow();
  });

  it("accepts app-owned uploaded profile photo paths", () => {
    const uploadedPhotoPath = "/api/media/assets/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2/display";

    expect(profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      photos: [uploadedPhotoPath]
    }).photos).toEqual([uploadedPhotoPath]);
  });

  it("rejects local data image profile photos", () => {
    expect(() => profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      photos: ["data:image/svg+xml,%3Csvg%3E%3C/svg%3E"]
    })).toThrow();
  });

  it("normalizes legacy Sapphic crowd payloads to Dyke", () => {
    const parsed = profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994,
      is_trans: true,
      crowds: ["T4T", "Sapphic"],
      visibility_rules: {
        ...emptyProfile.visibility_rules,
        active_crowd_modes: ["Sapphic"],
        crowds: ["Sapphic"]
      }
    });

    expect(parsed.crowds).toEqual(["T4T", "Dyke"]);
    expect(parsed.visibility_rules.active_crowd_modes).toEqual(["Dyke"]);
    expect(parsed.visibility_rules.crowds).toEqual(["Dyke"]);
  });

  it("limits explicitly capped profile option groups", () => {
    const baseProfile = {
      ...emptyProfile,
      display_name: "Cruusher",
      year_of_birth: 1994
    };

    expect(profilePayloadSchema.parse({
      ...baseProfile,
      pronouns: ["they/them", "she/her", "he/him"],
      identities: ["nonbinary", "woman", "genderqueer"],
      looking_for: ["chat", "dating", "friends"],
      vibes: ["Goth", "Rave", "Leather"],
      body_type: ["bear", "otter", "twink"],
      position: ["top"],
      role: ["switch"],
      hiv_status: ["prefer not to say"],
      covid_vaccine: ["yes"],
      mpox_vaccine: ["yes"]
    })).toMatchObject({
      pronouns: ["they/them", "she/her", "he/him"],
      body_type: ["bear", "otter", "twink"],
      position: ["top"],
      role: ["switch"]
    });

    expect(profilePayloadSchema.parse({
      ...baseProfile,
      vibes: ["Goth", "Rave", "Leather", "Punk", "Playful", "Kinky"]
    }).vibes).toEqual(["Rave", "Leather", "Punk", "Playful", "Kinky"]);

    expect(profilePayloadSchema.parse({
      ...baseProfile,
      body_type: ["bear", "otter", "twink", "stocky"]
    }).body_type).toEqual(["otter", "twink", "stocky"]);

    expect(profilePayloadSchema.parse({
      ...baseProfile,
      position: ["top", "bottom"]
    }).position).toEqual(["bottom"]);

    expect(profilePayloadSchema.parse({
      ...baseProfile,
      role: ["switch", "dominant"]
    }).role).toEqual(["dominant"]);

    expect(profilePayloadSchema.parse({
      ...baseProfile,
      covid_vaccine: ["yes", "partial"]
    }).covid_vaccine).toEqual(["partial"]);
  });

  it("accepts a complete adult date of birth and calculates age by month and day", () => {
    const parsed = profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      date_of_birth: "2000-07-18"
    });

    expect(parsed.date_of_birth).toBe("2000-07-18");
    expect(ageFromDateOfBirth("2008-07-18", new Date("2026-07-18T12:00:00.000Z"))).toBe(18);
    expect(ageFromDateOfBirth("2008-07-19", new Date("2026-07-18T12:00:00.000Z"))).toBe(17);
  });

  it("rejects invalid and under-18 dates of birth", () => {
    expect(() => profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      date_of_birth: "2020-02-30"
    })).toThrow();

    expect(() => profilePayloadSchema.parse({
      ...emptyProfile,
      display_name: "Cruusher",
      date_of_birth: "2012-06-15"
    })).toThrow();
  });
});
