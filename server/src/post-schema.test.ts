import { describe, expect, it } from "vitest";
import { createPostPayloadSchema, feedWindowSchema, updateFeedSettingsPayloadSchema } from "./post-schema.js";

describe("Feed Posted within compatibility", () => {
  it("normalizes the legacy never filter to the largest remaining window", () => {
    expect(feedWindowSchema.parse("never")).toBe("30d");
    expect(feedWindowSchema.default("7d").parse(undefined)).toBe("7d");
  });

  it("preserves every finite Posted within window", () => {
    const windows = ["1h", "3h", "6h", "24h", ...Array.from({ length: 24 }, (_, index) => `${index + 7}d`)];
    for (const window of windows) {
      expect(feedWindowSchema.parse(window)).toBe(window);
    }
  });

  it("still rejects unsupported windows", () => {
    for (const window of ["", "forever", "2d", "31d", null, 30]) {
      expect(feedWindowSchema.safeParse(window).success).toBe(false);
    }
  });

  it("normalizes legacy settings without changing never-expiring posts", () => {
    expect(updateFeedSettingsPayloadSchema.parse({
      locationPinVisibility: "mutuals",
      feedWindow: "never",
      postExpiryDefault: "never"
    })).toEqual({
      locationPinVisibility: "mutuals",
      showDistanceLabels: true,
      feedWindow: "30d",
      postExpiryDefault: "never"
    });
    expect(createPostPayloadSchema.parse({ content: "No expiry", expiresIn: "never" }).expiresIn).toBe("never");
    expect(updateFeedSettingsPayloadSchema.parse({ locationPinVisibility: "mutuals" })).not.toHaveProperty("feedWindow");
  });
});

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
    for (const expiresIn of ["30m", "1h", "3h", "6h", "12h", "24h", "2d", "3d", "5d", "7d", "8d", "9d", "10d", "11d", "12d", "13d", "14d", "15d", "16d", "17d", "18d", "19d", "20d", "21d", "22d", "23d", "24d", "25d", "26d", "27d", "28d", "29d", "30d", "never"] as const) {
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

  it("defaults distance disclosure on and accepts an explicit per-post choice", () => {
    expect(createPostPayloadSchema.parse({ content: "Default distance" }).showDistance).toBe(true);
    expect(createPostPayloadSchema.parse({ content: "No distance", showDistance: false }).showDistance).toBe(false);
  });

  it("keeps T4T as an explicit crowd target value for server-side membership enforcement", () => {
    expect(createPostPayloadSchema.parse({
      content: "T4T post",
      audience: "crowd",
      crowdTargets: ["T4T"]
    }).crowdTargets).toEqual(["T4T"]);
  });
});
