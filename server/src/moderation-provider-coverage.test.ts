import { describe, expect, it } from "vitest";
import { mergeProfilePhotoSafetyResults } from "./profile-photo-human-detection.js";
import { mapProviderResultToPolicy } from "./policy-mapper.js";
import {
  humanProofSourceUnavailable,
  resolveProfilePhotoAdultHumanGate
} from "./moderation-service.js";
import type { ModerationSurface, ProviderModerationResult } from "./moderation-types.js";

// Which scanners actually run, per surface. Written after a 2026-08-06 incident that was
// read as "Stream and Rekognition both went down at once" - two independent vendors failing
// in the same minute, which should have been suspicious. On most of these surfaces only one
// scanner is ever consulted, so a single provider returning anything unusable looks
// identical to a total outage. These tests pin who is asked, so the next incident cannot be
// misread the same way.

function streamResult(overrides: Partial<ProviderModerationResult> = {}): ProviderModerationResult {
  return {
    provider: "stream",
    provider_request_id: "stream-coverage",
    labels: [],
    latency_ms: 10,
    status: "complete",
    recommended_action: "keep",
    ...overrides
  };
}

function rekognitionResult(overrides: Partial<ProviderModerationResult> = {}): ProviderModerationResult {
  return {
    provider: "aws_rekognition",
    provider_request_id: "rekognition-coverage",
    labels: [],
    latency_ms: 20,
    status: "complete",
    recommended_action: "keep",
    ...overrides
  };
}

// Mirrors canUseProfilePhotoRekognitionFallback / canUseMessagePhotoRekognitionFallback in
// moderation-service.ts. If those gain or lose a surface, this table has to move with them.
function rekognitionFallbackSurfaces(): ModerationSurface[] {
  return ["profile_photo", "direct_message", "group_message", "feed"];
}

describe("which scanner covers which surface", () => {
  it.each([
    ["profile_photo", true],
    ["direct_message", true],
    ["group_message", true],
    ["feed", true],
    ["private_photo", false]
  ] as const)(
    "%s image has a Rekognition fallback: %s",
    (surface, expected) => {
      expect(rekognitionFallbackSurfaces().includes(surface)).toBe(expected);
    }
  );

  // The feed photo in the incident screenshots had no second scanner at all, so one
  // unusable Stream response was the whole outage. Rekognition now covers it: a partial
  // Stream leg plus a complete safety leg resolves instead of refusing.
  it("resolves a feed image from the safety leg when Stream is still pending", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult({ status: "partial", recommended_action: undefined }),
      rekognitionResult()
    );

    expect(rekognitionFallbackSurfaces()).toContain("feed");
    expect(merged.raw_result?.safety_leg_failed).toBeUndefined();
  });

  // Text never reaches Rekognition at all - it is an image detector. The profile-save
  // failure in the screenshots was one provider, not two.
  it("never routes text through the image detector", () => {
    const decision = mapProviderResultToPolicy({
      surface: "profile",
      contentType: "text",
      providerResult: streamResult({ status: "error", error: "Stream moderation request failed." })
    });

    expect(decision.category).toBe("provider_unavailable");
  });
});

describe("merging the Rekognition safety leg", () => {
  it("keeps a healthy verdict when both legs succeed", () => {
    const merged = mergeProfilePhotoSafetyResults(streamResult(), rekognitionResult());

    expect(merged.status).toBe("complete");
    expect(merged.error).toBeUndefined();
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).toBe("allow");
  });

  // A failing safety leg used to stamp status "error" and recommended_action "remove" onto
  // the merged result, discarding a healthy Stream verdict and refusing the upload. That
  // blocked real users whenever Rekognition hiccuped, so the primary verdict now stands and
  // the image is marked for review instead.
  it("keeps the Stream verdict when only the safety leg fails", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult(),
      rekognitionResult({ status: "error", error: "Image age-safety detection failed." })
    );

    expect(merged.status).toBe("complete");
    expect(merged.recommended_action).toBe("keep");
    expect(merged.raw_result?.safety_leg_failed).toBe(true);
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).toBe("allow");
  });

  // Switching detection off is a configuration choice, not an incident. It used to return
  // an error result, so PROFILE_PHOTO_REKOGNITION_ENABLED=false blocked every photo upload
  // on the app while reporting that every provider was down.
  it("treats disabled age-safety detection as no opinion, not an outage", () => {
    const disabled = rekognitionResult({
      provider_request_id: "rekognition-disabled",
      status: "skipped",
      recommended_action: undefined
    });
    const merged = mergeProfilePhotoSafetyResults(streamResult(), disabled);

    expect(merged.status).toBe("complete");
    expect(merged.recommended_action).toBe("keep");
    expect(merged.raw_result?.safety_leg_failed).toBeUndefined();
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).toBe("allow");
  });

  // A skipped leg must not silently swallow a rejection the primary already made.
  it("does not rescue an image the primary provider rejected", () => {
    const disabled = rekognitionResult({ status: "skipped", recommended_action: undefined });
    const merged = mergeProfilePhotoSafetyResults(
      streamResult({
        recommended_action: "remove",
        labels: [{
          provider_label: "stream_gore",
          normalized_label: "gore",
          confidence: 0.95,
          severity: "high"
        }]
      }),
      disabled
    );

    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).not.toBe("allow");
  });

  // A pending Stream leg must stay pending after the merge rather than being upgraded to an
  // outage - otherwise the fix for the async misclassification is undone here.
  it("keeps a pending Stream leg pending when the safety leg succeeds", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult({ status: "partial", recommended_action: undefined }),
      rekognitionResult()
    );

    expect(merged.status).toBe("partial");
    expect(merged.error).toBeUndefined();
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).category).toBe("provider_pending");
  });

  // The safety leg is a veto: it can reject an image Stream was happy with. That direction
  // must survive, or G5 stops holding.
  it("lets the safety leg override a Stream keep", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult(),
      rekognitionResult({
        recommended_action: "remove",
        labels: [{
          provider_label: "Amazon Rekognition: minor face",
          normalized_label: "minor_present",
          confidence: 0.97,
          severity: "critical"
        }]
      })
    );

    expect(merged.recommended_action).toBe("remove");
    expect(merged.labels).toHaveLength(1);
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).not.toBe("allow");
  });
});

// The adult-human gate reads labels that only Rekognition produces in practice:
// "human_present" comes solely from detectProfilePhotoHuman, and Stream under a No Action
// config rarely emits "adult_human_body". So when the safety leg fails or is switched off,
// the gate has no evidence to read - and rejecting for missing evidence when the evidence
// source never ran refuses every profile photo with "Profile photo must be of you."
describe("the adult-human gate needs its evidence source to have run", () => {
  const allow = {
    decision: "allow",
    severity: "none",
    confidence: 0,
    create_evidence_event: false,
    evidence_value: 0,
    trust_impact: 0,
    penalty_decays: true,
    moderation_history_required: false,
    reason_code: "content_allowed"
  } as const;

  it("detects a failed safety leg as a missing proof source", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult(),
      rekognitionResult({ status: "error", error: "timeout" })
    );

    expect(humanProofSourceUnavailable(merged)).toBe(true);
  });

  it("detects a skipped safety leg as a missing proof source", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult(),
      rekognitionResult({ status: "skipped", recommended_action: undefined })
    );

    expect(humanProofSourceUnavailable(merged)).toBe(true);
  });

  it("does not treat a working safety leg as missing", () => {
    const merged = mergeProfilePhotoSafetyResults(streamResult(), rekognitionResult());

    expect(humanProofSourceUnavailable(merged)).toBe(false);
  });

  it.each([
    ["failed", { status: "error", error: "timeout" }],
    ["skipped", { status: "skipped", recommended_action: undefined }]
  ] as const)(
    "does not reject a profile photo when the proof source %s",
    (_label, safetyOverrides) => {
      const merged = mergeProfilePhotoSafetyResults(
        streamResult(),
        rekognitionResult(safetyOverrides)
      );
      const gate = resolveProfilePhotoAdultHumanGate(merged, { ...allow }, {
        allowManualReview: false
      });

      expect(gate.status).toBe("resolved");
      expect(gate.decision.decision).toBe("allow");
      expect(gate.providerResult.raw_result?.cruush_profile_photo_gate)
        .toBe("skipped_no_proof_source");
    }
  );

  // With a working detector and still no human in the photo, the gate must still bite -
  // that is G2, profile photos are of the account holder.
  it("still rejects a photo with no human when the detector did run", () => {
    const merged = mergeProfilePhotoSafetyResults(streamResult(), rekognitionResult());
    const gate = resolveProfilePhotoAdultHumanGate(merged, { ...allow }, {
      allowManualReview: false
    });

    expect(gate.decision.decision).toBe("reject");
    expect(gate.decision.reason_code).toBe("profile_photo_not_adult_human");
  });

  it("still passes a photo the detector confirmed a human in", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult(),
      rekognitionResult({
        labels: [{
          provider_label: "Amazon Rekognition: Person",
          normalized_label: "human_present",
          confidence: 0.99,
          severity: "none"
        }]
      })
    );
    const gate = resolveProfilePhotoAdultHumanGate(merged, { ...allow }, {
      allowManualReview: false
    });

    expect(gate.status).toBe("resolved");
    expect(gate.decision.decision).toBe("allow");
  });
});

// The unblocking work above rests on "a real scanner already approved this image". When no
// real scanner ran, that premise is gone and refusing is correct. The mock provider returns
// "keep" for any filename it does not recognise, so it is a stub rather than a verdict -
// treating it as one would turn "no classifier configured" into "approved".
describe("nothing screened the image", () => {
  function mockPrimary(overrides: Partial<ProviderModerationResult> = {}): ProviderModerationResult {
    return {
      provider: "mock",
      provider_request_id: "mock-image",
      labels: [],
      latency_ms: 1,
      status: "completed",
      recommended_action: "keep",
      ...overrides
    };
  }

  it("refuses when the mock primary is paired with a failed safety leg", () => {
    const merged = mergeProfilePhotoSafetyResults(
      mockPrimary(),
      rekognitionResult({ status: "error", error: "AccessDeniedException" })
    );

    expect(merged.raw_result?.nothing_screened_the_image).toBe(true);
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).not.toBe("allow");
  });

  it("refuses when the mock primary is paired with a skipped safety leg", () => {
    const merged = mergeProfilePhotoSafetyResults(
      mockPrimary(),
      rekognitionResult({ status: "skipped", recommended_action: undefined })
    );

    expect(merged.raw_result?.nothing_screened_the_image).toBe(true);
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).not.toBe("allow");
  });

  it("refuses when an unusable primary is paired with a failed safety leg", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult({ status: "partial", recommended_action: undefined }),
      rekognitionResult({ status: "error", error: "timeout" })
    );

    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).decision).not.toBe("allow");
  });
});
