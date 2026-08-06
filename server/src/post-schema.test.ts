import { describe, expect, it } from "vitest";
import { createPostPayloadSchema } from "./post-schema.js";

describe("createPostPayloadSchema", () => {
  it("allows no crowd targets, one crowd, or multiple normalized crowd targets", () => {
    expect(createPostPayloadSchema.parse({
      content: "Local feed post",
      expiresIn: "6h"
    }).crowdTargets).toEqual([]);

    expect(createPostPayloadSchema.parse({
      content: "Dyke crowd post",
      expiresIn: "6h",
      crowdTargets: ["Dyke", "Gay", "Dyke"]
    }).crowdTargets).toEqual(["Dyke", "Gay"]);
  });

  it("keeps T4T as an explicit crowd target value for server-side membership enforcement", () => {
    expect(createPostPayloadSchema.parse({
      content: "T4T post",
      crowdTargets: ["T4T"]
    }).crowdTargets).toEqual(["T4T"]);
  });

  it("allows a post to have no expiry", () => {
    expect(createPostPayloadSchema.parse({
      content: "Permanent local feed post",
      expiresIn: "never"
    })).toMatchObject({
      content: "Permanent local feed post",
      expiresIn: "never"
    });
  });
});
