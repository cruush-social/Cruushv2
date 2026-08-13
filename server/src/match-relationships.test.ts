import { describe, expect, it } from "vitest";
import { effectiveVisibilityPolicyForEntitlement } from "./match-relationships.js";
import type { VisibilityPolicyPayload } from "./location-privacy.js";

const storedStealthPolicy: VisibilityPolicyPayload = {
  version: 1,
  subjectUserId: "53fd68d7-24fc-4cff-8cd7-a97ec0cadf97",
  policyVersion: 2,
  baseMode: "STEALTH",
  ghostRadiusMeters: 1609,
  preciseToMutualCruushes: false,
  preciseToMutualCrowds: [],
  auditRequired: false,
  updatedAtMs: Date.now(),
  expiresAtMs: null,
  keyVersion: "v1"
};

describe("effective visibility entitlement", () => {
  it("treats retained Stealth as normal public visibility after cruush+ ends", () => {
    expect(effectiveVisibilityPolicyForEntitlement(storedStealthPolicy, false)).toEqual({
      ...storedStealthPolicy,
      baseMode: "PUBLIC_PRECISE"
    });
  });

  it("keeps valid paid Stealth and unreadable-policy fail-closed Stealth", () => {
    expect(effectiveVisibilityPolicyForEntitlement(storedStealthPolicy, true)).toBe(storedStealthPolicy);
    expect(effectiveVisibilityPolicyForEntitlement({
      ...storedStealthPolicy,
      auditRequired: true
    }, false).baseMode).toBe("STEALTH");
  });
});
