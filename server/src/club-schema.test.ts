import { describe, expect, it } from "vitest";
import { createClubPayloadSchema, clubVisibilityPayloadSchema, updateClubPayloadSchema } from "./club-schema.js";
import { emptyProfile } from "./profile-schema.js";

describe("Club visibility payloads", () => {
  it("defaults to approval and accepts an explicit open-join option on creation", () => {
    const payload = { title: "Night Garden", summary: "", tags: ["night"], memberIds: [] };
    expect(createClubPayloadSchema.parse(payload).requiresJoinApproval).toBe(true);
    expect(createClubPayloadSchema.parse({ ...payload, requiresJoinApproval: false }).requiresJoinApproval).toBe(false);
    expect(createClubPayloadSchema.parse({ ...payload, requiresJoinApproval: true }).requiresJoinApproval).toBe(true);
    for (const invalid of [null, "false", 0]) {
      expect(createClubPayloadSchema.safeParse({ ...payload, requiresJoinApproval: invalid }).success).toBe(false);
    }
  });
  it("accepts optional approval changes without defaulting an omitted update", () => {
    const payload = { title: "Night Garden", summary: "", tags: ["night"] };
    expect(updateClubPayloadSchema.parse(payload)).not.toHaveProperty("requiresJoinApproval");
    for (const requiresJoinApproval of [false, true]) {
      expect(updateClubPayloadSchema.parse({ ...payload, requiresJoinApproval }).requiresJoinApproval).toBe(requiresJoinApproval);
    }
    for (const requiresJoinApproval of [null, "false", 0]) {
      expect(updateClubPayloadSchema.safeParse({ ...payload, requiresJoinApproval }).success).toBe(false);
    }
  });
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
