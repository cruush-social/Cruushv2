import { describe, expect, it } from "vitest";
import { mapProviderResultToPolicy } from "./policy-mapper.js";
import type { ModerationSurface, NormalizedModerationLabel, ProviderModerationResult } from "./moderation-types.js";

function providerResult(label: NormalizedModerationLabel, confidence = 0.91): ProviderModerationResult {
  return {
    provider: "mock",
    provider_request_id: "mock-test",
    latency_ms: 1,
    labels: [{
      provider_label: `mock_${label}`,
      normalized_label: label,
      confidence,
      severity: confidence >= 0.95 ? "critical" : "high"
    }]
  };
}

function map(label: NormalizedModerationLabel, surface: ModerationSurface, confidence = 0.91) {
  return mapProviderResultToPolicy({
    surface,
    contentType: surface === "profile_photo" ? "image" : "text",
    providerResult: providerResult(label, confidence)
  });
}

describe("policy mapper", () => {
  it("allows PnP discussion in private messages", () => {
    const decision = map("pnp_discussion", "direct_message");

    expect(decision.decision).toBe("allow");
    expect(decision.trust_impact).toBe(0);
    expect(decision.reason_code).toBe("private_pnp_discussion_allowed");
  });

  it("rejects PnP discussion in the feed without an immediate trust penalty", () => {
    const decision = map("pnp_discussion", "feed");

    expect(decision.decision).toBe("reject");
    expect(decision.create_evidence_event).toBe(true);
    expect(decision.evidence_value).toBe(10);
    expect(decision.trust_impact).toBe(0);
    expect(decision.feature_restrictions?.[0]?.feature).toBe("feed_posting");
  });

  it("suspends and caps trust for drug sales", () => {
    const decision = map("drug_sales", "direct_message", 0.97);

    expect(decision.decision).toBe("reject");
    expect(decision.trust_impact).toBe(-50);
    expect(decision.trust_cap).toBe(60);
    expect(decision.enforcement_action).toMatchObject({
      type: "suspend",
      reasonCode: "drug_sales"
    });
  });

  it("keeps sex-worker identity statements out of the commercial-sex rule", () => {
    const decision = mapProviderResultToPolicy({
      surface: "feed",
      contentType: "text",
      providerResult: {
        provider: "mock",
        provider_request_id: "mock-test",
        latency_ms: 1,
        labels: []
      }
    });

    expect(decision.decision).toBe("allow");
  });

  it("keeps chaser and fetishization handling report-driven instead of text-rejecting", () => {
    const decision = map("chaser_fetishization", "profile", 0.88);

    expect(decision.decision).toBe("allow");
    expect(decision.reason_code).toBe("chaser_fetishization_report_driven");
    expect(decision.trust_impact).toBe(0);
  });

  it("rejects Stream flag recommendations when no human moderation queue exists", () => {
    const decision = mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: {
        provider: "stream",
        provider_request_id: "stream-test",
        latency_ms: 1,
        labels: [],
        recommended_action: "flag",
        status: "complete"
      }
    });

    expect(decision.decision).toBe("reject");
    expect(decision.reason_code).toBe("provider_flagged_by_automod");
  });

  it("sets trust to zero for zero-tolerance categories", () => {
    const decision = map("underage_sexual", "profile_photo", 0.98);

    expect(decision.decision).toBe("reject");
    expect(decision.set_trust_to_zero).toBe(true);
    expect(decision.trust_cap).toBe(0);
    expect(decision.penalty_decays).toBe(false);
    expect(decision.enforcement_action).toMatchObject({
      type: "suspend",
      permanent: true
    });
  });

  it("treats low-confidence labels as no-action unless evidence threshold is reached", () => {
    const decision = map("commercial_sex", "feed", 0.65);

    expect(decision.decision).toBe("allow");
    expect(decision.create_evidence_event).toBe(false);
    expect(decision.trust_impact).toBe(0);
  });
});
