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

  it("labels fishnet arms as profile-photo ownership proof", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateImage({
      userId: "user-1",
      surface: "profile_photo",
      mimeType: "image/png",
      filename: "fishnet-arms.png",
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47])
    });

    expect(result.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "adult_human_body"
      })
    ]));
  });

  it("does not label chaser or fetishization language from text rules", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "Trans women are my fetish and bucket list experiment."
    });

    expect(result.labels).toEqual([]);
  });

  it("labels coded public drug language on feed/profile surfaces", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "party later ❄️ tina skiing"
    });

    expect(result.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "pnp_discussion",
        provider_label: "public_coded_drug_language"
      })
    ]));
  });

  it("keeps private drug discussion out of the public coded-language rule", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "direct_message",
      text: "I want to talk about tina and recovery boundaries."
    });

    expect(result.labels).toEqual([]);
  });

  it("labels coded commercial sex language on profiles", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "generous 🌹 only"
    });

    expect(result.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "commercial_sex",
        provider_label: "public_coded_commercial_sex_language"
      })
    ]));
  });

  it("labels coded bestiality language on public surfaces without banning unrelated kink language", async () => {
    const provider = new MockModerationProvider();
    const allowed = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "pup handler into rope classes and consent"
    });
    const blocked = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "k 9 taboo 🐕"
    });

    expect(allowed.labels).toEqual([]);
    expect(blocked.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "bestiality",
        provider_label: "public_coded_bestiality_language"
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
