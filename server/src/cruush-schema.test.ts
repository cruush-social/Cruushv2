import { describe, expect, it } from "vitest";
import { createCruushPayloadSchema } from "./cruush-schema.js";

const TO_USER_ID = "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97";

describe("createCruushPayloadSchema snapshot photo handling", () => {
  it("accepts a credential-bearing photo URL but persists null", () => {
    const parsed = createCruushPayloadSchema.parse({
      toUserId: TO_USER_ID,
      targetUser: {
        name: "jay",
        pronouns: "he/him",
        photo: "https://user:secret@attacker.example/avatar.png"
      }
    });

    expect(parsed.targetUser?.photo).toBeNull();
    expect(parsed.targetUser?.name).toBe("jay");
    expect(parsed.targetUser?.pronouns).toBe("he/him");
  });

  it("accepts a javascript: photo URL but persists null", () => {
    const parsed = createCruushPayloadSchema.parse({
      toUserId: TO_USER_ID,
      targetUser: { name: "jay", photo: "javascript:alert(1)" }
    });

    expect(parsed.targetUser?.photo).toBeNull();
  });

  it("accepts a plain https photo URL but persists null", () => {
    const parsed = createCruushPayloadSchema.parse({
      toUserId: TO_USER_ID,
      targetUser: { name: "jay", photo: "https://example.com/avatar.png" }
    });

    expect(parsed.targetUser?.photo).toBeNull();
  });

  it("accepts a non-string photo value but persists null", () => {
    const parsed = createCruushPayloadSchema.parse({
      toUserId: TO_USER_ID,
      targetUser: { name: "jay", photo: 42 }
    });

    expect(parsed.targetUser?.photo).toBeNull();
  });

  it("defaults photo to null when omitted", () => {
    const parsed = createCruushPayloadSchema.parse({
      toUserId: TO_USER_ID,
      targetUser: { name: "jay" }
    });

    expect(parsed.targetUser?.photo).toBeNull();
  });

  it("still rejects unknown targetUser keys", () => {
    const result = createCruushPayloadSchema.safeParse({
      toUserId: TO_USER_ID,
      targetUser: { name: "jay", avatarUrl: "https://example.com/x.png" }
    });

    expect(result.success).toBe(false);
  });
});
