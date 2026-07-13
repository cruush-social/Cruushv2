import { describe, expect, it } from "vitest";
import {
  buildStreamImageCheckRequest,
  createModerationProvider,
  isCompleteStreamImageResponse,
  MockModerationProvider,
  normalizeStreamLabel,
  streamLabelsFromResponse
} from "./moderation-provider.js";

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

  it("requires an explicit adult signal before treating a person as adult-human proof", () => {
    expect(normalizeStreamLabel("person")).toBeNull();
    expect(normalizeStreamLabel("portrait")).toBeNull();
    expect(normalizeStreamLabel("adult person")).toBe("adult_human_body");
    expect(normalizeStreamLabel("adult body part")).toBe("adult_human_body");
    expect(normalizeStreamLabel("adult face")).toBe("adult_human_body");
  });

  it("never lets adult or nudity words override child and minor labels", () => {
    expect(normalizeStreamLabel("child person")).toBe("underage_sexual");
    expect(normalizeStreamLabel("minor portrait nudity")).toBe("underage_sexual");
    expect(normalizeStreamLabel("underage adult body")).toBe("underage_sexual");
  });

  it("rejects age-ambiguous teen profile-photo labels without treating them as adult proof", () => {
    expect(normalizeStreamLabel("teen portrait")).toBe("profile_photo_not_adult_human");
    expect(normalizeStreamLabel("young-looking person")).toBe("profile_photo_not_adult_human");
  });

  it("preserves child and minor signals nested in Stream image results", () => {
    const labels = streamLabelsFromResponse({
      recommended_action: "remove",
      item: {
        flags: [{
          type: "image_moderation",
          result: [{
            subject: {
              age_group: "child",
              content: "person"
            }
          }]
        }]
      }
    });

    expect(labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "underage_sexual",
        severity: "high"
      })
    ]));
    expect(labels).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ normalized_label: "adult_human_body" })
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

  it("builds Stream image checks with only a capability URL and pseudonymous identifiers", () => {
    const request = buildStreamImageCheckRequest({
      userId: "d271f6da-c51d-4d73-a322-d9c56f45d4fa",
      surface: "profile_photo",
      contentId: "grant-correlation-id",
      imageUrl: "https://moderation-media-staging.cruush.app/api/moderation-media/capability-token",
      pseudonymKey: "0123456789abcdef0123456789abcdef",
      configKey: "cruush:automod"
    });
    const serialized = JSON.stringify(request);

    expect(request.entity_creator_id).toMatch(/^cm_[A-Za-z0-9_-]{43}$/);
    expect(request.user_id).toBe(request.entity_creator_id);
    expect(request.entity_id).toBe("grant-correlation-id");
    expect(request.moderation_payload.images).toEqual([
      "https://moderation-media-staging.cruush.app/api/moderation-media/capability-token"
    ]);
    expect(serialized).not.toContain("d271f6da-c51d-4d73-a322-d9c56f45d4fa");
    expect(serialized).not.toContain("originalFilename");
    expect(serialized).not.toContain("objectKey");
    expect(serialized).not.toContain("/api/media/profile-photos/");
  });

  it("treats missing or unfinished Stream image fields as a partial response", () => {
    expect(isCompleteStreamImageResponse({
      recommended_action: "keep",
      status: "complete",
      item: { flags: [] }
    })).toBe(true);
    expect(isCompleteStreamImageResponse({ status: "complete", item: { flags: [] } })).toBe(false);
    expect(isCompleteStreamImageResponse({ recommended_action: "keep", status: "partial", item: { flags: [] } })).toBe(false);
    expect(isCompleteStreamImageResponse({ recommended_action: "keep", status: "completed", item: { flags: [] } })).toBe(false);
  });

  it("accepts Stream's complete keep response when no review item is created", () => {
    expect(isCompleteStreamImageResponse({
      recommended_action: "keep",
      status: "complete"
    })).toBe(true);
  });
});
