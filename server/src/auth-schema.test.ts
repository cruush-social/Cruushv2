import { describe, expect, it } from "vitest";
import { signUpPayloadSchema } from "./auth-schema.js";

const baseSignup = {
  email: "person@example.com",
  password: "password-123",
  dateOfBirth: "1990-01-01",
  termsAccepted: true,
  privacyAccepted: true,
  productUpdatesOptIn: false
};

describe("signup consent", () => {
  it("requires Terms and Privacy acceptance while defaulting updates to off", () => {
    expect(signUpPayloadSchema.parse(baseSignup).productUpdatesOptIn).toBe(false);
    expect(() => signUpPayloadSchema.parse({ ...baseSignup, termsAccepted: false })).toThrow("Accept the Terms");
    expect(() => signUpPayloadSchema.parse({ ...baseSignup, privacyAccepted: false })).toThrow("Accept the Privacy Policy");
  });

  it("preserves an explicit product-updates opt-in", () => {
    expect(signUpPayloadSchema.parse({ ...baseSignup, productUpdatesOptIn: true }).productUpdatesOptIn).toBe(true);
  });
});
