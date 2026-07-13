import { describe, expect, it } from "vitest";
import { emptyProfile, profilePayloadSchema } from "./profile-schema.js";

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
});
