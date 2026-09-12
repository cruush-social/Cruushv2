import { readFileSync } from "node:fs";
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

describe("profile view logging", () => {
  it("suppresses views for Dark Room browsing only, never for Ghost Mode", () => {
    // Ghost Mode hides precise location behind a decoy, not interest. When it
    // also suppressed view logging, most of the app browsed invisibly and the
    // Views tab stopped moving.
    const source = readFileSync(new URL("./match-relationships.ts", import.meta.url), "utf8");
    const logLine = source.split("\n").filter((line) => line.includes("shouldLogProfileView:")).pop() ?? "";

    expect(logLine).toContain('viewerSettings.baseMode !== "STEALTH"');
    expect(logLine).not.toContain("viewerGhostMode");
    expect(logLine).not.toContain("targetGhostMode");
  });
});
