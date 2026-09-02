import { describe, expect, it } from "vitest";
import { mapProviderResultToPolicy } from "./policy-mapper.js";
import type { ProviderModerationResult } from "./moderation-types.js";

function result(labels: ProviderModerationResult["labels"]): ProviderModerationResult {
  return {
    provider: "mock",
    provider_request_id: "test",
    labels,
    latency_ms: 1,
    status: "completed",
    recommended_action: "keep"
  };
}

/**
 * A photo the provider raises nothing against is not evidence of anything, and
 * a group photo is a matter of whose face is being published rather than
 * misconduct. Neither may cost a member their trust score.
 */
describe("moderation stays quiet unless something is actually wrong", () => {
  it("allows content no label was raised against", () => {
    const decision = mapProviderResultToPolicy({
      surface: "direct_message",
      contentType: "image",
      providerResult: result([])
    });

    expect(decision.decision).toBe("allow");
    expect(decision.trust_impact).toBe(0);
  });

  it("allows a group photo in a private message", () => {
    const decision = mapProviderResultToPolicy({
      surface: "direct_message",
      contentType: "image",
      providerResult: result([
        { provider_label: "Multiple people", normalized_label: "multiple_people", confidence: 0.99, severity: "medium" }
      ])
    });

    expect(decision.decision).toBe("allow");
    expect(decision.trust_impact).toBe(0);
  });

  it("keeps a group photo off the surfaces where faces go public, without a penalty", () => {
    (["profile_photo", "feed"] as const).forEach((surface) => {
      const decision = mapProviderResultToPolicy({
        surface,
        contentType: "image",
        providerResult: result([
          { provider_label: "Multiple people", normalized_label: "multiple_people", confidence: 0.99, severity: "medium" }
        ])
      });

      expect(decision.decision).toBe("reject");
      expect(decision.trust_impact).toBe(0);
      expect(decision.create_evidence_event).toBe(false);
    });
  });
});
