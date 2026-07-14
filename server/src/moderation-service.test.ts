import { describe, expect, it } from "vitest";
import { resolveProfilePhotoAdultHumanGate } from "./moderation-service.js";
import { ALLOW_POLICY_DECISION, type ProviderModerationResult } from "./moderation-types.js";

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

describe("profile-photo adult-human gate", () => {
  it("allows a complete Stream keep without adult-human proof when shared Stream automod is enabled", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({ status: "completed", recommended_action: "keep" }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: true, allowStreamAutomod: true }
    )).toMatchObject({
      status: "resolved",
      providerResult: {
        raw_result: {
          cruush_profile_photo_gate: "stream_content_safety_only"
        }
      },
      decision: {
        decision: "allow"
      }
    });
  });

  it("returns manual review only for an explicit complete keep result when the fallback is allowed", () => {
    for (const status of ["complete", "completed"]) {
      expect(resolveProfilePhotoAdultHumanGate(
        streamResult({ status }),
        ALLOW_POLICY_DECISION,
        { allowManualReview: true }
      )).toMatchObject({
        status: "manual_review_required",
        decision: {
          decision: "quarantine",
          reason_code: "bank_profile_photo_manual_review_required"
        }
      });
    }
  });

  it("keeps missing adult-human proof fail-closed when manual review is not explicitly allowed", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult(),
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

  it("never sends partial or flagged provider results to manual review", () => {
    for (const providerResult of [
      streamResult({ status: "partial" }),
      streamResult({ recommended_action: "flag" })
    ]) {
      expect(resolveProfilePhotoAdultHumanGate(
        providerResult,
        ALLOW_POLICY_DECISION,
        { allowManualReview: true }
      )).toMatchObject({
        status: "resolved",
        decision: {
          decision: "reject",
          reason_code: "profile_photo_not_adult_human"
        }
      });
    }
  });

  it("allows positive adult-human proof without manual review", () => {
    expect(resolveProfilePhotoAdultHumanGate(
      streamResult({
        labels: [{
          provider_label: "adult human body",
          normalized_label: "adult_human_body",
          confidence: 0.91,
          severity: "none"
        }]
      }),
      ALLOW_POLICY_DECISION,
      { allowManualReview: true }
    )).toMatchObject({
      status: "resolved",
      decision: {
        decision: "allow"
      }
    });
  });
});
