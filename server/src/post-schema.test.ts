import { describe, expect, it } from "vitest";
import { createPostPayloadSchema } from "./post-schema.js";

describe("createPostPayloadSchema", () => {
  it("allows no crowd target or one normalized Crowd target", () => {
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

    expect(() => createPostPayloadSchema.parse({
      content: "Multiple crowd post",
      expiresIn: "6h",
      audience: "crowd",
      crowdTargets: ["Dyke", "Gay"]
    })).toThrow();
  });

  it("allows seven-day and never feed expiry values", () => {
    expect(createPostPayloadSchema.parse({
      content: "Seven days",
      expiresIn: "7d"
    }).expiresIn).toBe("7d");

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
