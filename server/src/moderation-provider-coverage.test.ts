import { describe, expect, it } from "vitest";
import { mergeProfilePhotoSafetyResults } from "./profile-photo-human-detection.js";
import { mapProviderResultToPolicy } from "./policy-mapper.js";
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
  return ["profile_photo", "direct_message", "group_message"];
}

describe("which scanner covers which surface", () => {
  it.each([
    ["profile_photo", true],
    ["direct_message", true],
    ["group_message", true],
    ["feed", false],
    ["private_photo", false]
  ] as const)(
    "%s image has a Rekognition fallback: %s",
    (surface, expected) => {
      expect(rekognitionFallbackSurfaces().includes(surface)).toBe(expected);
    }
  );

  // The feed photo in the incident screenshots. Only Stream is consulted here, so there was
  // never a second provider to fail - one unusable response is the whole outage.
  it("leaves a feed image with a single point of failure", () => {
    const decision = mapProviderResultToPolicy({
      surface: "feed",
      contentType: "image",
      providerResult: streamResult({ status: "partial", recommended_action: undefined })
    });

    expect(rekognitionFallbackSurfaces()).not.toContain("feed");
    expect(decision.decision).toBe("quarantine");
    expect(decision.category).toBe("provider_pending");
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

  // BUG - not fixed here, needs a policy call before the behaviour changes.
  //
  // The merge stamps status "error" onto the combined result whenever the safety leg did
  // not return "complete", discarding the fact that Stream answered fine. One failing leg
  // therefore presents as a total outage. detectImageChildFaces returns exactly this shape
  // when PROFILE_PHOTO_REKOGNITION_ENABLED is off, so a single config flag can make a
  // perfectly healthy Stream look like "every provider is down".
  //
  // These assertions document what happens today so the fix has something to flip.
  it("currently reports a total outage when only the safety leg fails", () => {
    const merged = mergeProfilePhotoSafetyResults(
      streamResult(),
      rekognitionResult({ status: "error", error: "Image age-safety detection failed." })
    );

    expect(merged.status).toBe("error");
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).category).toBe("provider_unavailable");
  });

  it("currently reports a total outage when age-safety detection is merely disabled", () => {
    const disabled = rekognitionResult({
      provider_request_id: "rekognition-disabled",
      status: "error",
      error: "Image age-safety detection is disabled."
    });
    const merged = mergeProfilePhotoSafetyResults(streamResult(), disabled);

    expect(merged.status).toBe("error");
    expect(mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: merged
    }).category).toBe("provider_unavailable");
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
