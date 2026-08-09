import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  moderateImageOrReject,
  moderateMessageTextOrAllowByKeyword,
  moderateProfileOrReject,
  moderateTextOrReject,
  moderateTextWithLocalFallback,
  resolveProfilePhotoAdultHumanGate,
  userMessageForDecision
} from "./moderation-service.js";
import {
  ALLOW_POLICY_DECISION,
  type ModerationSurface,
  type PolicyDecision,
  type ProviderModerationResult
} from "./moderation-types.js";

const { detectImageChildFaces, detectProfilePhotoHuman, detectPublicImageSafety } = vi.hoisted(() => ({
  detectImageChildFaces: vi.fn(),
  detectProfilePhotoHuman: vi.fn(),
  detectPublicImageSafety: vi.fn()
}));

vi.mock("./profile-photo-human-detection.js", async () => {
  const actual = await vi.importActual<typeof import("./profile-photo-human-detection.js")>(
    "./profile-photo-human-detection.js"
  );

  return { ...actual, detectImageChildFaces, detectProfilePhotoHuman, detectPublicImageSafety };
});

function createApp() {
  return {
    config: {
      MODERATION_PROVIDER: "mock",
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: false,
      STREAM_API_KEY: "",
      STREAM_API_SECRET: "",
      STREAM_MODERATION_CONFIG_KEY: ""
    },
    db: {
      query: vi.fn().mockResolvedValue({ rows: [] })
    }
  } as unknown as FastifyInstance;
}

async function moderateSurface(surface: ModerationSurface, text: string) {
  const app = createApp();
  const input = {
    userId: "user-1",
    surface,
    text
  } as const;

  if (surface === "profile") {
    return moderateProfileOrReject(app, {
      userId: input.userId,
      fields: { bio: text }
    });
  }

  if (surface === "direct_message" || surface === "group_message") {
    return moderateMessageTextOrAllowByKeyword(app, input);
  }

  return moderateTextOrReject(app, input);
}

describe("text language moderation policy", () => {
  it("rejects the hard-r racial slur across feed, messaging, and profiles", async () => {
    for (const surface of ["feed", "direct_message", "group_message", "profile"] as const) {
      await expect(moderateSurface(surface, "n.i.g.g.e.r")).rejects.toMatchObject({
        code: "CONTENT_REJECTED"
      });
    }
  });

  it("allows LGBTQ slurs, nigga, sexual slang, and general profanity on every text surface", async () => {
    const text = "faggot tranny nigga fuck shit bitch cunt slut whore dick cock pussy";

    for (const surface of ["feed", "direct_message", "group_message", "profile"] as const) {
      await expect(moderateSurface(surface, text)).resolves.toMatchObject({
        decision: expect.objectContaining({ decision: "allow" })
      });
    }
  });

  it("uses provider review for allowed slurs but skips it for ordinary profanity in messages", async () => {
    await expect(moderateSurface("direct_message", "faggot tranny nigga")).resolves.toMatchObject({
      providerResult: expect.objectContaining({ provider: "mock" })
    });
    await expect(moderateSurface("direct_message", "fuck shit bitch cunt")).resolves.toMatchObject({
      providerResult: expect.objectContaining({ provider: "keyword_prefilter" })
    });
  });

  it("still rejects violent context that contains an allowed LGBTQ slur", async () => {
    for (const surface of ["feed", "direct_message"] as const) {
      await expect(moderateSurface(surface, "kill all faggots")).rejects.toMatchObject({
        code: "CONTENT_REJECTED"
      });
    }
  });
});

function streamResult(overrides: Partial<ProviderModerationResult> = {}): ProviderModerationResult {
  return {
    provider: "stream",
    provider_request_id: "stream-request-1",
    labels: [],
    latency_ms: 12,
    status: "complete",
    recommended_action: "keep",
    raw_result: {},
    ...overrides
  };
}

describe("moderation error messages", () => {
  it("never describes a text moderation outage as a photo failure", () => {
    const decision: PolicyDecision = {
      ...ALLOW_POLICY_DECISION,
      decision: "quarantine",
      reason_code: "provider_unavailable",
      user_message_code: "moderation_delayed"
    };

    expect(userMessageForDecision(decision, "text")).toContain("check this text");
    expect(userMessageForDecision(decision, "text")).not.toContain("check this photo");
    expect(userMessageForDecision(decision, "image")).toContain("check this photo");
  });

  it("uses a text-only local fallback for an unavailable feed provider", async () => {
    const fallback = await moderateTextWithLocalFallback(
      createApp(),
      {
        userId: "user-1",
        surface: "feed",
        text: "a safe feed post"
      },
      streamResult({
        status: "error",
        error: "Stream request failed"
      })
    );

    expect(fallback).toMatchObject({
      provider: "local_text_fallback",
      labels: []
    });
    expect(fallback.raw_result).toMatchObject({
      fallback: {
        reason: "stream_text_moderation_unavailable",
        surface: "feed",
        provider: "stream",
        status: "error"
      }
    });
  });
});

// Regression: a Stream text outage used to 503 every profile save and every
// keyword-flagged message, because the local fallback covered the feed surface only.
describe("text moderation during a provider outage", () => {
  function createAppWithBrokenStream() {
    const app = createApp();

    Object.assign(app.config, {
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "",
      STREAM_API_SECRET: "",
      STREAM_MODERATION_CONFIG_KEY: ""
    });

    return app;
  }

  it("screens safe text locally instead of refusing it on every text surface", async () => {
    for (const surface of ["feed", "profile", "direct_message", "group_message"] as const) {
      const app = createAppWithBrokenStream();
      const result = surface === "profile"
        ? await moderateProfileOrReject(app, { userId: "user-1", fields: { bio: "a safe bio" } })
        : await moderateTextOrReject(app, { userId: "user-1", surface, text: "a safe note" });

      expect(result.decision.decision).toBe("allow");
      expect(result.providerResult.provider).toBe("local_text_fallback");
    }
  });

  it("still rejects content the local rules catch while the provider is down", async () => {
    const app = createAppWithBrokenStream();

    await expect(
      moderateProfileOrReject(app, { userId: "user-1", fields: { bio: "n.i.g.g.e.r" } })
    ).rejects.toMatchObject({ code: "CONTENT_REJECTED" });

    await expect(
      moderateTextOrReject(app, { userId: "user-1", surface: "feed", text: "kill all faggots" })
    ).rejects.toMatchObject({ code: "CONTENT_REJECTED" });
  });
});

describe("profile-photo adult-human gate", () => {
  it("does not treat a complete Stream keep as proof that a profile photo contains a human", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({ status: "completed" }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: false }
    )).toMatchObject({
      status: "resolved",
      decision: {
        decision: "reject",
        reason_code: "profile_photo_not_adult_human"
      }
    });
  });

  it("allows a Stream keep only when an independent human label is present", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({
        labels: [{
          provider_label: "Amazon Rekognition: Person",
          normalized_label: "human_present",
          confidence: 0.99,
          severity: "none"
        }]
      }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: false }
    )).toMatchObject({
      status: "resolved",
      decision: { decision: "allow" }
    });
  });

  it("retains the dormant manual fallback only when explicitly allowed", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult(),
      ALLOW_POLICY_DECISION,
      { allowManualReview: true }
    )).toMatchObject({
      status: "manual_review_required",
      decision: { reason_code: "bank_profile_photo_manual_review_required" }
    });
  });

  it("fails closed without adult-human proof when neither shared automod nor manual fallback is enabled", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult(),
      ALLOW_POLICY_DECISION,
      { allowManualReview: false }
    )).toMatchObject({
      status: "resolved",
      decision: { reason_code: "profile_photo_not_adult_human" }
    });
  });
});

// Regression: a Stream image outage refused every feed photo, because the Rekognition
// fallback covered profile photos and message photos but not the feed.
describe("feed image moderation during a Stream outage", () => {
  beforeEach(() => {
    detectImageChildFaces.mockReset();
    detectProfilePhotoHuman.mockReset();
    detectPublicImageSafety.mockReset();
  });

  function createFeedApp() {
    const app = createApp();

    Object.assign(app.config, {
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "",
      STREAM_API_SECRET: "",
      STREAM_MODERATION_CONFIG_KEY: "",
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false
    });
    (app as unknown as { log: unknown }).log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

    return app;
  }

  function feedImage() {
    return {
      userId: "user-1",
      surface: "feed" as const,
      mimeType: "image/jpeg",
      bytes: Buffer.from("feed-image")
    };
  }

  function rekognitionResult(overrides: Partial<ProviderModerationResult> = {}): ProviderModerationResult {
    return {
      provider: "aws_rekognition",
      provider_request_id: "rekognition-feed-1",
      labels: [],
      latency_ms: 8,
      status: "complete",
      recommended_action: "keep",
      raw_result: {},
      ...overrides
    };
  }

  it("screens the photo with the public-image detector instead of refusing it", async () => {
    detectPublicImageSafety.mockResolvedValue(rekognitionResult());

    const result = await moderateImageOrReject(createFeedApp(), feedImage());

    expect(detectPublicImageSafety).toHaveBeenCalledOnce();
    expect(detectImageChildFaces).not.toHaveBeenCalled();
    expect(result.decision.decision).toBe("allow");
    expect(result.providerResult.provider).toContain("aws_rekognition");
  });

  it("rejects a feed photo the fallback finds explicit", async () => {
    detectPublicImageSafety.mockResolvedValue(rekognitionResult({
      recommended_action: "remove",
      labels: [{
        provider_label: "Amazon Rekognition moderation: Explicit > Explicit Nudity",
        normalized_label: "adult_nudity",
        confidence: 0.96,
        severity: "high"
      }]
    }));

    await expect(moderateImageOrReject(createFeedApp(), feedImage()))
      .rejects.toMatchObject({ code: "CONTENT_REJECTED" });
  });

  it("still fails closed when Rekognition is down too", async () => {
    detectPublicImageSafety.mockResolvedValue(rekognitionResult({
      status: "error",
      recommended_action: undefined,
      error: "Rekognition timeout"
    }));

    await expect(moderateImageOrReject(createFeedApp(), feedImage()))
      .rejects.toMatchObject({ code: "MODERATION_UNAVAILABLE" });
  });

  it("keeps the cheap child-face check while Stream is answering", async () => {
    detectImageChildFaces.mockResolvedValue(rekognitionResult());

    const app = createFeedApp();
    Object.assign(app.config, {
      STREAM_MODERATION_ENABLED: false,
      MODERATION_PROVIDER: "mock",
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: false
    });

    await moderateImageOrReject(app, feedImage());

    expect(detectImageChildFaces).toHaveBeenCalledOnce();
    expect(detectPublicImageSafety).not.toHaveBeenCalled();
  });
});
