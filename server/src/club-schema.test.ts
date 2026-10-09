import { describe, expect, it } from "vitest";
import { createClubPayloadSchema, clubVisibilityPayloadSchema } from "./club-schema.js";
import { emptyProfile } from "./profile-schema.js";

describe("Club visibility payloads", () => {
  it("accepts omitted and false member-only Out of Sight rules", () => {
    const { outside_service_area_members: _omitted, ...legacyRules } = emptyProfile.visibility_rules;
    const createPayload = {
      title: "Test Club",
      summary: "",
      tags: ["club"],
      memberIds: []
    };

    expect(createClubPayloadSchema.parse({ ...createPayload, visibilityRules: legacyRules })
      .visibilityRules?.outside_service_area_members).toBe(false);
    expect(clubVisibilityPayloadSchema.parse({ visibilityRules: legacyRules })
      .visibilityRules.outside_service_area_members).toBe(false);
    expect(clubVisibilityPayloadSchema.parse({ visibilityRules: emptyProfile.visibility_rules })
      .visibilityRules.outside_service_area_members).toBe(false);
  });

  it("rejects the member-only Out of Sight rule on Club create and visibility updates", () => {
    const visibilityRules = {
      ...emptyProfile.visibility_rules,
      outside_service_area_members: true
    };
    const createPayload = {
      title: "Test Club",
      summary: "",
      tags: ["club"],
      memberIds: [],
      visibilityRules
    };

    expect(createClubPayloadSchema.safeParse(createPayload).success).toBe(false);
    expect(clubVisibilityPayloadSchema.safeParse({ visibilityRules }).success).toBe(false);
    const result = clubVisibilityPayloadSchema.safeParse({ visibilityRules });
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["visibilityRules", "outside_service_area_members"]);
    }
  });
});
