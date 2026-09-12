import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  moderateFeedTextWithLocalFallback,
  moderateImageOrReject,
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

const { detectImageChildFaces, detectProfilePhotoHuman, detectPublicImageSafety } = vi.hoisted(() => ({
  detectImageChildFaces: vi.fn(),
  detectProfilePhotoHuman: vi.fn(),
  detectPublicImageSafety: vi.fn()
}));

let streamAppSequence = 0;

vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    moderation = {
      check: streamModerationCheck
    };
  }
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
    },
    log: {
      error: vi.fn(),
      warn: vi.fn()
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
      STREAM_MODERATION_CONFIG_KEY: `cruush-test-${++streamAppSequence}`
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
  streamModerationCheck.mockResolvedValue({
    status: "complete",
    recommended_action: "keep",
    item: { id: "stream-test-item" }
  });
  detectImageChildFaces.mockReset();
  detectProfilePhotoHuman.mockReset();
  detectPublicImageSafety.mockReset();
});

describe("moderation error messages", () => {
  it("names the actual photo rejection category without changing the decision", () => {
    const decision: PolicyDecision = {
      ...ALLOW_POLICY_DECISION,
      decision: "reject",
      category: "multiple_people",
      user_message_code: "content_rejected",
    };
    const message = userMessageForDecision(decision, "image");
    expect(message).toContain("more than one person");
    expect(message).not.toContain("hate");
    expect(decision.decision).toBe("reject");
  });

  it("never describes a text moderation outage as a photo failure", () => {
    const decision: PolicyDecision = {
      ...ALLOW_POLICY_DECISION,
      decision: "quarantine",
      reason_code: "provider_unavailable",
      user_message_code: "moderation_delayed"
    };

    expect(userMessageForDecision(decision, "text")).toContain("Nothing was saved");
    expect(userMessageForDecision(decision, "text")).toContain("check this text");
    expect(userMessageForDecision(decision, "text")).not.toContain("check this photo");
    expect(userMessageForDecision(decision, "image")).toContain("Nothing was saved");
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

    expect(streamModerationCheck).toHaveBeenCalledTimes(3);
  });

  it("publishes a Stream sexual-harassment flag and records it for moderator review", async () => {
    const app = createStreamApp();
    streamModerationCheck.mockResolvedValue({
      status: "complete",
      recommended_action: "flag",
      item: {
        id: "stream-sexual-harassment-review",
        ai_text_severity: "high",
        flags: [{
          type: "SEXUAL_HARASSMENT",
          labels: ["SEXUAL_HARASSMENT"]
        }]
      }
    });

    await expect(moderateProfileOrReject(app, {
      userId: "user-1",
      fields: { bio: "Yes sir, fuck me harder, fag. I love when we talk like this." },
      contentId: "user-1"
    })).resolves.toMatchObject({
      decision: {
        decision: "allow",
        category: "harassment",
        reason_code: "harassment_evidence_only"
      },
      moderationStatus: "flagged",
      flaggedReason: "harassment_review_only"
    });

    const reviewInsert = (app.db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]) => String(sql).includes("insert into content_reviews")
    );
    expect(reviewInsert?.[1]).toEqual(expect.arrayContaining([
      "allowed",
      "flagged",
      "harassment_review_only"
    ]));
  });

  it("uses the local fallback for direct-message text instead of leaving it pending when Stream is unavailable", async () => {
    streamModerationCheck.mockRejectedValue(new Error("Stream unavailable"));

    await expect(moderateMessageTextOrAllowByKeyword(createStreamApp(), {
      userId: "user-1",
      surface: "direct_message",
      text: "faggot tranny nigga"
    })).resolves.toMatchObject({
      decision: expect.objectContaining({ decision: "allow" }),
      providerResult: expect.objectContaining({ provider: "local_text_fallback" })
    });
  });

  it("still rejects a direct-message threat through the local fallback when Stream is unavailable", async () => {
    streamModerationCheck.mockRejectedValue(new Error("Stream unavailable"));

    await expect(moderateMessageTextOrAllowByKeyword(createStreamApp(), {
      userId: "user-1",
      surface: "direct_message",
      text: "I am going to hurt you."
    })).rejects.toMatchObject({ code: "CONTENT_REJECTED" });
  });
});

describe("profile-photo adult-human gate", () => {
  it("accepts a complete Stream keep when Rekognition is unavailable", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({ status: "completed" }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: false }
    )).toMatchObject({
      status: "resolved",
      decision: { decision: "allow" }
    });
  });

  it("accepts an independent Rekognition human result when Stream is unavailable", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({
        provider: "mock+aws_rekognition",
        status: "complete",
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

  it("accepts a softer human signal on a photo the provider already kept", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({
        provider: "mock+aws_rekognition",
        status: "complete",
        labels: [{
          provider_label: "Amazon Rekognition: Person",
          normalized_label: "human_present",
          confidence: 0.55,
          severity: "none"
        }]
      }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: true }
    )).toMatchObject({
      status: "resolved",
      decision: { decision: "allow" }
    });
  });

  it("retains the dormant manual fallback only when explicitly allowed", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({ provider: "mock" }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: true }
    )).toMatchObject({
      status: "manual_review_required",
      decision: { reason_code: "bank_profile_photo_manual_review_required" }
    });
  });

  it("fails closed without adult-human proof when neither shared automod nor manual fallback is enabled", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({ provider: "mock" }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: false }
    )).toMatchObject({
      status: "resolved",
      decision: { reason_code: "profile_photo_not_adult_human" }
    });
  });
});

describe("independent photo-provider diagnostics", () => {
  it("records Stream independently when Rekognition keeps the profile-photo upload available", async () => {
    const app = createStreamApp();
    Object.assign(app.config, {
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      STREAM_MODERATION_CONFIG_KEY: "stream-diagnostic-fallback"
    });
    const streamFailure = Object.assign(new Error("Stream service unavailable"), { statusCode: 503, code: "STREAM_UNAVAILABLE" });
    streamModerationCheck.mockRejectedValue(streamFailure);
    detectProfilePhotoHuman.mockResolvedValue(streamResult({
      provider: "aws_rekognition",
      provider_request_id: "rekognition-healthy-1",
      labels: [{
        provider_label: "Amazon Rekognition: Person",
        normalized_label: "human_present",
        confidence: 0.99,
        severity: "none"
      }],
      status: "complete",
      raw_result: {}
    }));

    await expect(moderateImageOrReject(app, {
      userId: "user-1",
      surface: "profile_photo",
      mimeType: "image/jpeg",
      imageUrl: "https://moderation-media.cruush.app/photo-1",
      contentId: "media-123",
      bytes: Buffer.from("profile-photo")
    })).resolves.toMatchObject({
      decision: { decision: "allow" },
      providerResult: { provider: "stream+aws_rekognition" }
    });

    const records = (app.db.query as ReturnType<typeof vi.fn>).mock.calls
      .filter(([sql]) => String(sql).includes("insert into moderation_system_errors"));
    expect(records).toHaveLength(1);
    expect(records[0]?.[1]).toEqual(expect.arrayContaining([
      "stream",
      "profile_photo",
      "image",
      "http_503",
      "media-123"
    ]));
  });

  it("records both providers when neither can screen a profile photo", async () => {
    const app = createStreamApp();
    Object.assign(app.config, {
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      STREAM_MODERATION_CONFIG_KEY: "stream-diagnostic-total-outage"
    });
    streamModerationCheck.mockRejectedValue(Object.assign(new Error("Stream service unavailable"), { statusCode: 503 }));
    detectProfilePhotoHuman.mockResolvedValue(streamResult({
      provider: "aws_rekognition",
      provider_request_id: "rekognition-error-1",
      status: "error",
      error: "Rekognition service unavailable",
      raw_result: { status_code: 504, error_name: "TimeoutError" }
    }));

    await expect(moderateImageOrReject(app, {
      userId: "user-1",
      surface: "profile_photo",
      mimeType: "image/jpeg",
      imageUrl: "https://moderation-media.cruush.app/photo-2",
      contentId: "media-456",
      bytes: Buffer.from("profile-photo")
    })).rejects.toMatchObject({ code: "MODERATION_UNAVAILABLE" });

    const records = (app.db.query as ReturnType<typeof vi.fn>).mock.calls
      .filter(([sql]) => String(sql).includes("insert into moderation_system_errors"));
    expect(records.map(([, params]) => (params as unknown[])[1])).toEqual(["stream", "aws_rekognition"]);
    expect(records.map(([, params]) => (params as unknown[])[4])).toEqual(["http_503", "http_504"]);
    expect(records.every(([, params]) => (params as unknown[])[6] === "media-456")).toBe(true);
  });

  it("keeps a profile-photo upload available through Stream when Rekognition is unavailable", async () => {
    const app = createStreamApp();
    Object.assign(app.config, {
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      STREAM_MODERATION_CONFIG_KEY: "stream-healthy-rekognition-outage"
    });
    streamModerationCheck.mockResolvedValue({
      status: "complete",
      recommended_action: "keep"
    });
    detectProfilePhotoHuman.mockResolvedValue(streamResult({
      provider: "aws_rekognition",
      provider_request_id: "rekognition-error-2",
      status: "error",
      error: "Rekognition service unavailable",
      raw_result: { status_code: 503, error_name: "ServiceUnavailableException" }
    }));

    await expect(moderateImageOrReject(app, {
      userId: "user-1",
      surface: "profile_photo",
      mimeType: "image/jpeg",
      imageUrl: "https://moderation-media.cruush.app/photo-3",
      contentId: "media-789",
      bytes: Buffer.from("profile-photo")
    })).resolves.toMatchObject({
      decision: { decision: "allow" },
      providerResult: {
        status: "complete",
        recommended_action: "keep"
      }
    });

    const records = (app.db.query as ReturnType<typeof vi.fn>).mock.calls
      .filter(([sql]) => String(sql).includes("insert into moderation_system_errors"));
    expect(records).toHaveLength(1);
    expect(records[0]?.[1]).toEqual(expect.arrayContaining([
      "aws_rekognition",
      "profile_photo",
      "image",
      "http_503",
      "media-789"
    ]));
  });

  it("keeps a message-photo upload available through Stream when Rekognition is unavailable", async () => {
    const app = createStreamApp();
    Object.assign(app.config, {
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      STREAM_MODERATION_CONFIG_KEY: "stream-message-healthy-rekognition-outage"
    });
    streamModerationCheck.mockResolvedValue({
      status: "complete",
      recommended_action: "keep"
    });
    detectPublicImageSafety.mockResolvedValue(streamResult({
      provider: "aws_rekognition",
      provider_request_id: "rekognition-message-error-1",
      status: "error",
      error: "Rekognition service unavailable",
      raw_result: { status_code: 503, error_name: "ServiceUnavailableException" }
    }));

    await expect(moderateImageOrReject(app, {
      userId: "user-1",
      surface: "direct_message",
      mimeType: "image/jpeg",
      imageUrl: "https://moderation-media.cruush.app/message-photo-1",
      contentId: "message-media-1",
      bytes: Buffer.from("message-photo")
    })).resolves.toMatchObject({
      decision: { decision: "allow" },
      providerResult: {
        status: "complete",
        recommended_action: "keep"
      }
    });

    expect(detectPublicImageSafety).toHaveBeenCalledOnce();
    expect(detectImageChildFaces).not.toHaveBeenCalled();
  });

  it("keeps explicit private-message photos sendable while exposing the explicit label to DL Mode", async () => {
    const app = createApp();
    Object.assign(app.config, {
      PROFILE_PHOTO_REKOGNITION_ENABLED: true
    });
    detectPublicImageSafety.mockResolvedValue(streamResult({
      provider: "aws_rekognition",
      provider_request_id: "rekognition-message-explicit-1",
      labels: [{
        provider_label: "Amazon Rekognition moderation: Explicit Nudity",
        normalized_label: "adult_nudity",
        confidence: 0.97,
        severity: "high"
      }],
      recommended_action: "remove"
    }));

    await expect(moderateImageOrReject(app, {
      userId: "user-1",
      surface: "direct_message",
      mimeType: "image/jpeg",
      bytes: Buffer.from("message-photo")
    })).resolves.toMatchObject({
      decision: {
        decision: "allow",
        category: "adult_nudity"
      },
      providerResult: {
        provider: "mock+aws_rekognition",
        labels: [expect.objectContaining({ normalized_label: "adult_nudity" })]
      }
    });

    expect(detectPublicImageSafety).toHaveBeenCalledOnce();
    expect(detectImageChildFaces).not.toHaveBeenCalled();
  });
});

describe("feed image moderation fallback", () => {
  it("uses public-image safety when the primary provider is unavailable", async () => {
    const app = createApp();
    Object.assign(app.config, {
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18,
      PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000
    });
    detectPublicImageSafety.mockResolvedValue({
      provider: "aws_rekognition",
      provider_request_id: "rekognition-feed-1",
      labels: [],
      latency_ms: 4,
      status: "complete",
      recommended_action: "keep",
      raw_result: {}
    });

    await expect(moderateImageOrReject(app, {
      userId: "user-1",
      surface: "feed",
      mimeType: "image/jpeg",
      bytes: Buffer.from("feed-image")
    })).resolves.toMatchObject({
      decision: { decision: "allow" },
      providerResult: { provider: "mock+aws_rekognition" }
    });

    expect(detectPublicImageSafety).toHaveBeenCalledOnce();
    expect(detectImageChildFaces).not.toHaveBeenCalled();
  });

  it("fails a Stream partial image response without creating a provider outage queue row", async () => {
    const app = createStreamApp();
    streamModerationCheck.mockResolvedValue({
      status: "partial",
      recommended_action: "keep",
      task_id: "stream-async-image-1"
    });

    await expect(moderateImageOrReject(app, {
      userId: "user-1",
      surface: "feed",
      mimeType: "image/jpeg",
      imageUrl: "https://example.com/moderation-image.jpg",
      bytes: Buffer.from("feed-image")
    })).rejects.toMatchObject({
      statusCode: 503,
      code: "MODERATION_UNAVAILABLE"
    });

    const queries = (app.db.query as ReturnType<typeof vi.fn>).mock.calls.map(([sql]) => String(sql));
    expect(queries.some((sql) => sql.includes("insert into content_reviews"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into moderation_system_errors"))).toBe(false);
  });
});
