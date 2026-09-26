import { describe, expect, it } from "vitest";
import { createPostPayloadSchema } from "./post-schema.js";

describe("createPostPayloadSchema", () => {
  it("allows no crowd target or one or more distinct normalized Crowd targets", () => {
    expect(createPostPayloadSchema.parse({
      content: "Local feed post",
      expiresIn: "6h"
    }).crowdTargets).toEqual([]);

    expect(createPostPayloadSchema.parse({
      content: "Dyke crowd post",
      expiresIn: "6h",
      audience: "crowd",
      crowdTargets: ["Dyke", "Dyke"]
    }).crowdTargets).toEqual(["Dyke"]);

    expect(createPostPayloadSchema.parse({
      content: "Multiple crowd post",
      expiresIn: "6h",
      audience: "crowd",
      crowdTargets: ["Dyke", "Gay"]
    }).crowdTargets).toEqual(["Dyke", "Gay"]);

    expect(createPostPayloadSchema.parse({
      content: "Every crowd post",
      audience: "crowd",
      crowdTargets: ["T4T", "Sapphic", "Gay", "Dyke", "Gay"]
    }).crowdTargets).toEqual(["T4T", "Dyke", "Gay"]);
  });

  it("requires at least one Crowd for a Crowd audience", () => {
    const result = createPostPayloadSchema.safeParse({
      content: "No crowd chosen",
      audience: "crowd",
      crowdTargets: []
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.crowdTargets).toEqual([
      "Pick at least one Crowd to post to, or choose a different audience."
    ]);
    expect(createPostPayloadSchema.safeParse({
      content: "Missing crowd list",
      audience: "crowd"
    }).success).toBe(false);
  });

  it("rejects unknown Crowd targets and Crowd targets on other audiences", () => {
    expect(createPostPayloadSchema.safeParse({
      content: "Unknown crowd",
      audience: "crowd",
      crowdTargets: ["Gay", "Bears"]
    }).success).toBe(false);

    const publicWithCrowds = createPostPayloadSchema.safeParse({
      content: "Public with crowds",
      audience: "public",
      crowdTargets: ["Gay", "Dyke"]
    });
    expect(publicWithCrowds.success).toBe(false);
    expect(publicWithCrowds.error?.flatten().fieldErrors.crowdTargets).toEqual([
      "Crowd targets require the Crowd audience."
    ]);
  });

  it("allows every ordered Feed expiry value", () => {
    for (const expiresIn of ["30m", "1h", "3h", "6h", "12h", "24h", "2d", "3d", "5d", "7d", "never"] as const) {
      expect(createPostPayloadSchema.parse({
        content: `Expires in ${expiresIn}`,
        expiresIn
      }).expiresIn).toBe(expiresIn);
    }

    expect(createPostPayloadSchema.parse({
      content: "No expiry",
      expiresIn: "never"
    }).expiresIn).toBe("never");
  });

  it("defaults new feed posts to never expire", () => {
    expect(createPostPayloadSchema.parse({
      content: "Default expiry"
    }).expiresIn).toBe("never");
  });

  it("keeps T4T as an explicit crowd target value for server-side membership enforcement", () => {
    expect(createPostPayloadSchema.parse({
      content: "T4T post",
      audience: "crowd",
      crowdTargets: ["T4T"]
    }).crowdTargets).toEqual(["T4T"]);
  });
});
