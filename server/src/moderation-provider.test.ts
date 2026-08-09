import { describe, expect, it, vi } from "vitest";
import {
  buildStreamImageCheckRequest,
  createModerationProvider,
  createModerationProviderOrUnavailable,
  isCompleteStreamImageResponse,
  MockModerationProvider,
  normalizeStreamLabel,
  StreamModerationProvider,
  streamLabelsFromResponse
} from "./moderation-provider.js";

const { streamModerationCheck } = vi.hoisted(() => ({
  streamModerationCheck: vi.fn()
}));

vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    moderation = {
      check: streamModerationCheck
    };
  }
}));

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

  it("marks completed safe mock image checks with the same keep contract used by Stream", async () => {
    const provider = new MockModerationProvider();
    const result = await provider.moderateImage({
      userId: "user-1",
      surface: "profile_photo",
      mimeType: "image/png",
      filename: "profile.png",
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47])
    });

    expect(result).toMatchObject({
      status: "completed",
      recommended_action: "keep"
    });
  });

  it("requires an explicit adult signal before treating a person as adult-human proof", () => {
    expect(normalizeStreamLabel("person")).toBeNull();
    expect(normalizeStreamLabel("portrait")).toBeNull();
    expect(normalizeStreamLabel("adult person")).toBe("adult_human_body");
    expect(normalizeStreamLabel("adult body part")).toBe("adult_human_body");
    expect(normalizeStreamLabel("adult face")).toBe("adult_human_body");
  });

  it("does not turn age-only image guesses into sexual-minor violations", () => {
    expect(normalizeStreamLabel("child person")).toBeNull();
    expect(normalizeStreamLabel("minor portrait nudity")).toBeNull();
    expect(normalizeStreamLabel("underage adult body")).toBeNull();
  });

  it("ignores profile-photo age inference while preserving explicit CSAM signals", () => {
    expect(normalizeStreamLabel("child person", "profile_photo")).toBeNull();
    expect(normalizeStreamLabel("minor portrait", "profile_photo")).toBeNull();
    expect(normalizeStreamLabel("child sexual abuse material", "profile_photo")).toBe("underage_sexual");
  });

  it("ignores age-ambiguous profile-photo labels without treating them as adult proof", () => {
    expect(normalizeStreamLabel("teen portrait", "profile_photo")).toBeNull();
    expect(normalizeStreamLabel("young-looking person", "profile_photo")).toBeNull();
  });

  it("does not persist age-only signals nested in Stream image results", () => {
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
    }, "profile_photo");

    expect(labels).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ normalized_label: "profile_photo_not_adult_human" })
    ]));
    expect(labels).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ normalized_label: "underage_sexual" })
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

  it("adds launch emoji signals for public drug language while keeping candy context-aware", async () => {
    const provider = new MockModerationProvider();
    const labSignal = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "afters 🧪"
    });
    const candyOnly = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "bringing 🍬 for friends"
    });
    const candyWithContext = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "🍬 chemsex afters"
    });

    expect(labSignal.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({ normalized_label: "pnp_discussion" })
    ]));
    expect(candyOnly.labels).toEqual([]);
    expect(candyWithContext.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({ normalized_label: "pnp_discussion" })
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

  it("keeps money emoji context-aware for commercial sex rules", async () => {
    const provider = new MockModerationProvider();
    const allowed = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "budget talk 💸"
    });
    const blocked = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "💸 for a hookup session"
    });

    expect(allowed.labels).toEqual([]);
    expect(blocked.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "commercial_sex",
        provider_label: "public_coded_commercial_sex_language"
      })
    ]));
  });

  it("keeps minor-coded emojis context-aware on public surfaces", async () => {
    const provider = new MockModerationProvider();
    const allowed = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "nostalgia and plush toys 🧸"
    });
    const blocked = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "🧸 explicit meet"
    });

    expect(allowed.labels).toEqual([]);
    expect(blocked.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "underage_sexual",
        provider_label: "public_coded_underage_language"
      })
    ]));
  });

  it("labels coded bestiality language on public surfaces without banning unrelated kink language", async () => {
    const provider = new MockModerationProvider();
    const allowed = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "pup handler into rope classes and consent 🐶"
    });
    const blocked = await provider.moderateText({
      userId: "user-1",
      surface: "profile",
      text: "k 9 taboo 🐾"
    });

    expect(allowed.labels).toEqual([]);
    expect(blocked.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_label: "bestiality",
        provider_label: "public_coded_bestiality_language"
      })
    ]));
  });

  it("adds context-aware weapon and scam emoji review signals", async () => {
    const provider = new MockModerationProvider();
    const allowedWeapon = await provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "knife skills class 🔪"
    });
    const blockedWeapon = await provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "I will hurt you 🔪"
    });
    const allowedFinance = await provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "market chart 📈"
    });
    const blockedFinance = await provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "📈 guaranteed profit"
    });

    expect(allowedWeapon.labels).toEqual([]);
    expect(blockedWeapon.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({ normalized_label: "threat" })
    ]));
    expect(allowedFinance.labels).toEqual([]);
    expect(blockedFinance.labels).toEqual(expect.arrayContaining([
      expect.objectContaining({ normalized_label: "spam" })
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

  it("turns provider construction failures into an unavailable provider result", async () => {
    const provider = createModerationProviderOrUnavailable({
      MODERATION_PROVIDER: "mock",
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "",
      STREAM_API_SECRET: "",
      STREAM_MODERATION_CONFIG_KEY: ""
    });

    await expect(provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "hello"
    })).resolves.toMatchObject({
      provider: "stream",
      status: "error",
      error: expect.stringContaining("STREAM_API_KEY")
    });
  });

  it("retries transient Stream failures before returning a result", async () => {
    streamModerationCheck
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ status: "complete", recommended_action: "keep" });

    const provider = new StreamModerationProvider({
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "retry-key",
      STREAM_API_SECRET: "retry-secret",
      STREAM_MODERATION_CONFIG_KEY: "retry-config"
    });

    await expect(provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "hello"
    })).resolves.toMatchObject({ status: "complete" });
    expect(streamModerationCheck).toHaveBeenCalledTimes(2);
  });

  it("opens a circuit after repeated Stream failures", async () => {
    streamModerationCheck.mockRejectedValue(new Error("stream is down"));
    const provider = new StreamModerationProvider({
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "circuit-key",
      STREAM_API_SECRET: "circuit-secret",
      STREAM_MODERATION_CONFIG_KEY: "circuit-config"
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(provider.moderateText({
        userId: "user-1",
        surface: "feed",
        text: "hello"
      })).resolves.toMatchObject({ status: "error" });
    }

    const callsBeforeOpenCircuit = streamModerationCheck.mock.calls.length;
    await expect(provider.moderateText({
      userId: "user-1",
      surface: "feed",
      text: "hello"
    })).resolves.toMatchObject({
      status: "error",
      error: "Stream moderation is temporarily unavailable."
    });
    expect(streamModerationCheck).toHaveBeenCalledTimes(callsBeforeOpenCircuit);
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
