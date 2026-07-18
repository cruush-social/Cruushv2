import { describe, expect, it } from "vitest";
import { ageFromDateOfBirth, emptyProfile, profilePayloadSchema } from "./profile-schema.js";

describe("profile schema", () => {
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
