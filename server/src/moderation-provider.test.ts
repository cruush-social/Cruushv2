import { describe, expect, it, vi } from "vitest";
import { createModerationProvider, MockModerationProvider, StreamModerationProvider } from "./moderation-provider.js";

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

  it("submits the signed inspection URL as the Stream image payload", async () => {
    const check = vi.fn().mockResolvedValue({
      recommended_action: "keep",
      status: "complete",
      item: { id: "stream-item-1", flags: [] }
    });
    const provider = new StreamModerationProvider({
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush:automod"
    });
    (provider as unknown as { client: { moderation: { check: typeof check } } }).client = {
      moderation: { check }
    };
    const imageUrl = "https://api.cruush.test/api/media/moderation/asset/display?purpose=moderation_inspection&expires=1&signature=test";

    await provider.moderateImage({
      userId: "user-1",
      surface: "direct_message",
      mimeType: "image/webp",
      imageUrl,
      contentId: "asset-1",
      bytes: Buffer.from("sanitized")
    });

    expect(check).toHaveBeenCalledWith(expect.objectContaining({
      entity_id: "asset-1",
      moderation_payload: { images: [imageUrl] },
      options: { force_sync: true }
    }));
  });
});
