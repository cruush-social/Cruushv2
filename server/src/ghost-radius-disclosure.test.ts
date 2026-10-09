import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GHOST_DISPLAY_ACCURACY_METERS,
  GHOST_RADIUS_OPTIONS
} from "./location-privacy.js";

/**
 * The display location token is decrypted by the viewer, so anything inside it
 * is disclosed. Reporting the subject's configured ghost radius told an observer
 * how far the true pin could be from the decoy (between GHOST_MIN_OFFSET_RATIO
 * times the radius and the radius) and distinguished a 500 ft user from a 5 mi
 * one. Every ghost subject now reports the same fixed value.
 */
describe("ghost radius disclosure", () => {
  const source = readFileSync(new URL("./location-privacy.ts", import.meta.url), "utf8");

  it("does not put the subject's configured radius into the display payload", () => {
    expect(source).not.toMatch(/accuracyDisplayM\s*=\s*ghost\.radiusMeters/);
    expect(source).toMatch(/accuracyDisplayM\s*=\s*GHOST_DISPLAY_ACCURACY_METERS/);
  });

  it("reports a single fixed value that cannot identify the chosen radius", () => {
    expect(typeof GHOST_DISPLAY_ACCURACY_METERS).toBe("number");
    expect(GHOST_DISPLAY_ACCURACY_METERS).toBeGreaterThan(0);

    // A constant is only non-disclosing if it is the same for every subject,
    // so it must not be derived from the per-subject policy.
    const disclosureSites = source.match(/accuracyDisplayM\s*=\s*[^;]+;/g) ?? [];
    for (const site of disclosureSites) {
      expect(site).not.toMatch(/ghost\.|policy\.|ghostRadiusMeters/);
    }
  });

  it("still supports every configured radius option server-side", () => {
    // The radius must keep driving the offset itself; only its disclosure stops.
    expect(GHOST_RADIUS_OPTIONS.length).toBeGreaterThan(1);
    expect(source).toMatch(/radiusMeters:\s*resolveGhostRadiusMeters|ghostRadiusMeters/);
  });
});
