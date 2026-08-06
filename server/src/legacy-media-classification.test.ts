import { describe, expect, it } from "vitest";
import { classifyLegacyProviderResult } from "./legacy-media-classification.js";
import type { ProviderModerationResult } from "./moderation-types.js";

const baseResult: ProviderModerationResult = {
  provider: "aws_rekognition",
  provider_request_id: "test-request",
  labels: [],
  latency_ms: 1,
  status: "complete",
  recommended_action: "keep"
};

describe("classifyLegacyProviderResult", () => {
  it("marks explicit moderation labels explicit", () => {
    expect(classifyLegacyProviderResult({
      ...baseResult,
      labels: [{
        provider_label: "Explicit Nudity",
        normalized_label: "adult_nudity",
        confidence: 0.99,
        severity: "high"
      }]
    })).toEqual({
      classification: "explicit",
      reason: "legacy_explicit_label"
    });
  });

  it("marks a complete provider keep result non-explicit", () => {
    expect(classifyLegacyProviderResult(baseResult)).toEqual({
      classification: "non_explicit",
      reason: "legacy_provider_allowed"
    });
  });

  it("keeps a complete but non-keep result masked as uncertain", () => {
    expect(classifyLegacyProviderResult({
      ...baseResult,
      recommended_action: "remove"
    })).toEqual({
      classification: "uncertain",
      reason: "legacy_provider_uncertain"
    });
  });

  it("leaves provider failures unknown and fail-closed", () => {
    expect(classifyLegacyProviderResult({
      ...baseResult,
      status: "error",
      error: "provider unavailable"
    })).toEqual({
      classification: "unknown",
      reason: "legacy_provider_unavailable"
    });
  });
});
