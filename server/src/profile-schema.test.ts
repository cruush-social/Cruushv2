import { describe, expect, it } from "vitest";
import { emptyProfile, profilePayloadSchema } from "./profile-schema.js";

describe("profile schema", () => {
  it("accepts app-owned uploaded profile photo paths", () => {
    const uploadedPhotoPath = "/media/profile-photos/d271f6da-c51d-4d73-a322-d9c56f45d4fa-7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2.png";

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
});
