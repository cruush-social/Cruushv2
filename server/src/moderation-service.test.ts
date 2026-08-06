import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  moderateFeedTextWithLocalFallback,
  moderateMessageTextOrAllowByKeyword,
  moderateProfileOrReject,
  moderateTextOrReject,
  resolveProfilePhotoAdultHumanGate,
  userMessageForDecision
} from "./moderation-service.js";
import {
  ALLOW_POLICY_DECISION,
  type ModerationSurface,
  type PolicyDecision,
  type ProviderModerationResult
} from "./moderation-types.js";

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

function createStreamApp() {
  return {
    ...createApp(),
    config: {
      MODERATION_PROVIDER: "stream",
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: true,
      STREAM_API_KEY: "stream-key",
      STREAM_API_SECRET: "stream-secret",
      STREAM_MODERATION_CONFIG_KEY: "cruush-test"
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

beforeEach(() => {
  streamModerationCheck.mockReset();
});

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
    const fallback = await moderateFeedTextWithLocalFallback(
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
        provider: "stream",
        status: "error"
      }
    });
  });

  it("uses the same local fallback for profile text when the provider is unavailable", async () => {
    const fallback = await moderateFeedTextWithLocalFallback(
      createApp(),
      {
        userId: "user-1",
        surface: "profile",
        text: "Queer trans masc switch looking for dates, coffee, rope classes, and aftercare."
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
        provider: "stream",
        status: "error"
      }
    });
  });

  it("saves ordinary profile text through the local fallback when Stream is unavailable", async () => {
    streamModerationCheck.mockRejectedValue(new Error("Stream unavailable"));

    await expect(moderateProfileOrReject(createStreamApp(), {
      userId: "user-1",
      fields: {
        bio: "Queer trans masc switch looking for dates, coffee, rope classes, and aftercare.",
        signal: "Coffee and rope class."
      }
    })).resolves.toMatchObject({
      decision: expect.objectContaining({ decision: "allow" }),
      providerResult: expect.objectContaining({
        provider: "local_text_fallback"
      })
    });

    expect(streamModerationCheck).toHaveBeenCalledTimes(1);
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
