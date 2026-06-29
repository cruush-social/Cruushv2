import { describe, expect, it } from "vitest";
import { createModerationProvider, MockModerationProvider } from "./moderation-provider.js";

describe("moderation provider", () => {
  it("allows safe queer and dating profile language", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "Queer trans masc switch looking for dates, coffee, rope classes, and aftercare."
    });

    expect(result.labels).toEqual([]);
  });

  it("does not auto-block consensual adult and kink terms", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "Dominant switch, into impact play, negotiation, consent, kink parties, and cuddles."
    });

    expect(result.labels).toEqual([]);
  });

  it("labels threats for enforcement", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "direct_message",
      text: "I am going to hurt you."
    });

    expect(result.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "threat"
      })
    ]));
  });

  it("labels explicit minor safety content as zero-tolerance", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "direct_message",
      text: "Looking for underage explicit meetups."
    });

    expect(result.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "underage_sexual",
        severity: "critical"
      })
    ]));
  });

  it("flags chaser and fetishizing language toward trans users", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "Trans women are my fetish and bucket list experiment."
    });

    expect(result.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "chaser_fetishization"
      })
    ]));
  });

  it("fails clearly when Stream moderation is enabled without secrets", () => {
    expect(() => createModerationProvider({
      MODERATION_PROVIDER: "mock",
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "",
      STREAM_API_SECRET: "",
      STREAM_MODERATION_CONFIG_KEY: ""
    })).toThrow(/STREAM_API_KEY/);
  });
});
