import { describe, expect, it } from "vitest";
import { mapProviderResultToPolicy } from "./policy-mapper.js";
import type { ProviderModerationResult } from "./moderation-types.js";

// An image nothing could scan must never be published. A total provider outage returns no
// labels at all, so there is no way to tell adult nudity - which this app allows - from
// gore, an animal, or a hate symbol, which it never allows. Refusing during an outage is
// recoverable; a published hate symbol is not.

function outageResult(overrides: Partial<ProviderModerationResult> = {}): ProviderModerationResult {
  return {
    provider: "aws_rekognition",
    provider_request_id: "rekognition-error-smoke",
    labels: [],
    latency_ms: 12,
    status: "error",
    error: "Rekognition unreachable",
    ...overrides
  };
}

describe("smoke: unscreened photos are refused", () => {
  // The refusal is the invariant. The category is telemetry: a provider that failed is an
  // outage, a provider still working is not, and only the first should ever page anyone.
  const unscreenedCases = [
    { status: "error", error: "down", category: "provider_unavailable" },
    { status: "partial", error: undefined, category: "provider_pending" },
    { status: "pending", error: undefined, category: "provider_pending" },
    { status: "provider_processing", error: undefined, category: "provider_pending" }
  ] as const;

  for (const { status, error, category } of unscreenedCases) {
    it(`refuses a profile photo when the provider reports ${status}`, () => {
      const decision = mapProviderResultToPolicy({
        surface: "profile_photo",
        contentType: "image",
        providerResult: outageResult({ status, error })
      });

      expect(decision.decision).not.toBe("allow");
      expect(decision.category).toBe(category);
      expect(decision.user_message_code).toBe("moderation_delayed");
    });
  }

  it("refuses message photos during an outage too", () => {
    const decision = mapProviderResultToPolicy({
      surface: "direct_message",
      contentType: "image",
      providerResult: outageResult()
    });

    expect(decision.decision).not.toBe("allow");
    expect(decision.category).toBe("provider_unavailable");
  });

  // An in-flight check that also carries an error is a real failure, not async work.
  it("treats a pending status with an error as an outage, not async work", () => {
    const decision = mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: outageResult({ status: "partial", error: "socket hang up" })
    });

    expect(decision.decision).not.toBe("allow");
    expect(decision.category).toBe("provider_unavailable");
  });

  it("still allows a photo a working provider approved", () => {
    const decision = mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: {
        provider: "aws_rekognition",
        provider_request_id: "rekognition-ok",
        latency_ms: 30,
        status: "complete",
        recommended_action: "keep",
        labels: [{
          provider_label: "Amazon Rekognition: Person",
          normalized_label: "human_present",
          confidence: 0.99,
          severity: "none"
        }]
      }
    });

    expect(decision.decision).toBe("allow");
  });
});
