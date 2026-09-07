import { describe, expect, it } from "vitest";
import { emptyProfilePayload } from "../../src/app/lib/profileApi";
import { profilePayloadSchema, profileVisibilityRulesSchema } from "./profile-schema.js";

/**
 * The client builds these shapes and the server parses them with strict
 * schemas, so a field on one side and not the other is a 400 the member reads
 * as "Request validation failed". Parsing the client's own default payload
 * with the server's own schema is what catches that before anyone hits it.
 */
describe("the client payload the server actually receives", () => {
  it("accepts the client's empty profile payload", () => {
    const result = profilePayloadSchema.safeParse({ ...emptyProfilePayload, display_name: "Test" });

    if (!result.success) {
      throw new Error(`server rejects the client payload: ${JSON.stringify(result.error.issues, null, 2)}`);
    }

    expect(result.success).toBe(true);
  });

  it("would notice a field the client grew and the server did not", () => {
    // Proves the check has teeth: the schema is strict, so drift shows up here
    // rather than as a 400 in someone's face.
    const result = profilePayloadSchema.safeParse({
      ...emptyProfilePayload,
      display_name: "Test",
      somethingTheServerHasNotLearnedYet: true,
    });

    expect(result.success).toBe(false);
  });

  it("accepts the client's visibility rules shape", () => {
    const result = profileVisibilityRulesSchema.safeParse(emptyProfilePayload.visibility_rules);

    if (!result.success) {
      throw new Error(`server rejects the client visibility rules: ${JSON.stringify(result.error.issues, null, 2)}`);
    }

    expect(result.success).toBe(true);
  });
});
