import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Ghost Mode hides a user's precise position: the app shows them as "Nearby"
 * rather than a distance (see formatDistanceLabel in location-privacy.ts).
 *
 * The nearby-activity notification path short-circuits only on STEALTH, so a
 * GHOST subject reaches the delivery loop, where the distance is computed from
 * their decrypted precise coordinates. Publishing that distance in notification
 * metadata handed every nearby recipient a ~16m fix on a user who had opted
 * into being hidden, defeating the feature.
 */
describe("ghost mode distance leak", () => {
  const source = readFileSync(new URL("./nearby-notifications.ts", import.meta.url), "utf8");

  it("does not publish a computed distance in notification metadata", () => {
    expect(source).not.toMatch(/distanceMiles:\s*Number\(/);
    expect(source).not.toMatch(/metadata:\s*\{[^}]*distance/i);
  });

  it("still computes distance server-side to gate delivery by radius", () => {
    // The fix must not disable the radius gate — only stop publishing the value.
    // The bound may be a literal or a named constant, so match either.
    expect(source).toMatch(/const distance = distanceMiles\(/);
    expect(source).toMatch(/distance\s*>\s*(?:\d+|[A-Z_][A-Z0-9_]*)/);
  });

  it("keeps sourceUserId in metadata so the notification still resolves", () => {
    expect(source).toMatch(/sourceUserId: input\.sourceUserId/);
  });
});
