import { describe, expect, it } from "vitest";
import { profilePayloadSchema } from "./profile-schema.js";
import { emptyProfile } from "./profile-schema.js";

/**
 * ABDL is age-roleplay adjacent, and cruush carries no age-roleplay signal
 * anywhere: not as an option, a badge, a filter, or a free tag. Removing it
 * from the Scenes list is only half of that; the tag has to be refused too, or
 * it comes straight back as a discovery signal people can search.
 */
describe("ABDL is not carried anywhere", () => {
  const payload = (overrides: Record<string, unknown>) => ({ ...emptyProfile, display_name: "Test", ...overrides });

  it("refuses abdl as a profile tag, without pointing at a field", () => {
    const result = profilePayloadSchema.safeParse(payload({ tags: ["abdl"] }));

    expect(result.success).toBe(false);
    const message = result.success ? "" : result.error.issues[0]?.message ?? "";
    expect(message).toBe("cruush does not carry that tag.");
    expect(message).not.toMatch(/Add it under/);
  });

  it("refuses it whatever case or hash it arrives with", () => {
    for (const tag of ["ABDL", "#abdl", "Abdl"]) {
      expect(profilePayloadSchema.safeParse(payload({ tags: [tag] })).success).toBe(false);
    }
  });

  it("still points a genuine structured option at its field", () => {
    const result = profilePayloadSchema.safeParse(payload({ tags: ["leather"] }));

    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/Add it under/);
    }
  });
});
