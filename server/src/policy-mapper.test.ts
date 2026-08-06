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

  it.each(["private_photo", "feed"] as const)(
    "rejects nudity on the non-message %s surface",
    (surface) => {
      const decision = mapProviderResultToPolicy({
        surface,
        contentType: "image",
        providerResult: providerResult("adult_nudity", 0.98)
      });

      expect(decision).toMatchObject({
        decision: "reject",
        reason_code: "nudity_outside_private_messages",
        user_message_code: "nudity_private_messages_only",
        trust_impact: 0
      });
    }
  );

  it("allows adult nudity on profile photos so DL Mode can mask the image client-side", () => {
    const decision = mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: {
        ...providerResult("adult_nudity", 0.98),
        recommended_action: "remove",
        status: "complete"
      }
    });

    expect(decision).toMatchObject({
      decision: "allow",
      reason_code: "profile_photo_nudity_allowed",
      trust_impact: 0
    });
  });

  it.each(["direct_message", "group_message"] as const)(
    "allows adult nudity only in %s image messages",
    (surface) => {
      const decision = mapProviderResultToPolicy({
        surface,
        contentType: "image",
        providerResult: {
          ...providerResult("adult_explicit", 0.98),
          recommended_action: "remove"
        }
      });

      expect(decision).toMatchObject({
        decision: "allow",
        reason_code: "private_message_nudity_allowed",
        trust_impact: 0
      });
    }
  );

  it("rejects PnP discussion in the feed without an immediate trust penalty", () => {
    const decision = map("pnp_discussion", "feed");

    expect(decision.decision).toBe("reject");
    expect(decision.create_evidence_event).toBe(true);
    expect(decision.evidence_value).toBe(10);
    expect(decision.trust_impact).toBe(0);
    expect(decision.feature_restrictions?.[0]?.feature).toBe("feed_posting");
  });

  it("rejects public/profile coded drug language from profiles with profile write restrictions", () => {
    const decision = map("pnp_discussion", "profile");

    expect(decision.decision).toBe("reject");
    expect(decision.create_evidence_event).toBe(true);
    expect(decision.trust_impact).toBe(0);
    expect(decision.feature_restrictions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        feature: "profile_updates",
        reasonCode: "public_pnp_discussion"
      })
    ]));
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

  it.each(["direct_message", "group_message"] as const)(
    "allows non-human screenshot/interface images in %s messages",
    (surface) => {
      const decision = mapProviderResultToPolicy({
        surface,
        contentType: "image",
        providerResult: providerResult("screenshot_or_interface", 0.98)
      });

      expect(decision).toMatchObject({
        decision: "allow",
        reason_code: "non_human_message_photo_allowed",
        trust_impact: 0
      });
    }
  );

  it("continues rejecting screenshot/interface images outside private messages", () => {
    const decision = mapProviderResultToPolicy({
      surface: "profile_photo",
      contentType: "image",
      providerResult: providerResult("screenshot_or_interface", 0.98)
    });

    expect(decision).toMatchObject({
      decision: "reject",
      reason_code: "screenshot_image_content",
      user_message_code: "content_rejected"
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

  it.each(["block", "bounce", "shadow_block"])(
    "rejects Stream %s recommendations instead of treating them as an allow",
    (recommendedAction) => {
      const decision = mapProviderResultToPolicy({
        surface: "profile_photo",
        contentType: "image",
        providerResult: {
          provider: "stream",
          provider_request_id: `stream-${recommendedAction}`,
          latency_ms: 1,
          labels: [],
          recommended_action: recommendedAction,
          status: "completed"
        }
      });

      expect(decision.decision).toBe("reject");
      expect(decision.reason_code).toBe("provider_recommended_non_keep");
    }
  );

  it.each(["partial", "pending", "provider_processing", "error"])(
    "fails closed for a %s image moderation response",
    (status) => {
      const decision = mapProviderResultToPolicy({
        surface: "profile_photo",
        contentType: "image",
        providerResult: {
          provider: "stream",
          provider_request_id: `stream-${status}`,
          latency_ms: 1,
          labels: [],
          recommended_action: "keep",
          status
        }
      });

      expect(decision.decision).toBe("quarantine");
      expect(decision.reason_code).toBe("provider_unavailable");
    }
  );

  it.each(["underage_sexual", "bestiality"] as const)(
    "sets trust to zero for the zero-tolerance %s category",
    (category) => {
      const decision = map(category, "profile_photo", 0.98);

      expect(decision.decision).toBe("reject");
      expect(decision.set_trust_to_zero).toBe(true);
      expect(decision.trust_cap).toBe(0);
      expect(decision.penalty_decays).toBe(false);
      expect(decision.enforcement_action).toMatchObject({
        type: "suspend",
        permanent: true
      });
    }
  );

  it("applies the permanent all-feature ban to a definite child face", () => {
    const decision = map("minor_present", "profile_photo", 0.99);

    expect(decision).toMatchObject({
      decision: "reject",
      reason_code: "minor_face_detected",
      set_trust_to_zero: true,
      trust_cap: 0,
      penalty_decays: false,
      enforcement_action: {
        type: "suspend",
        permanent: true
      }
    });
    expect(decision.feature_restrictions?.map((restriction) => restriction.feature)).toEqual([
      "feed_posting",
      "direct_messages",
      "group_messages",
      "group_creation",
      "profile_updates",
      "photo_uploads",
      "map_visibility",
      "crowd_visibility"
    ]);
  });

  it("allows an age range that overlaps 18 without punishing the account", () => {
    const decision = map("minor_age_ambiguous", "profile_photo", 0.85);

    expect(decision).toMatchObject({
      decision: "allow",
      reason_code: "minor_age_overlap_allowed",
      trust_impact: 0,
      create_evidence_event: false
    });
    expect(decision.enforcement_action).toBeUndefined();
  });

  it("rejects hate symbols in profile photos", () => {
    const decision = map("hate_symbol", "profile_photo", 0.93);

    expect(decision).toMatchObject({
      decision: "reject",
      reason_code: "hate_symbol",
      trust_impact: -40
    });
  });

  it("treats low-confidence labels as no-action unless evidence threshold is reached", () => {
    const decision = map("commercial_sex", "feed", 0.65);

    expect(decision.decision).toBe("allow");
    expect(decision.create_evidence_event).toBe(false);
    expect(decision.trust_impact).toBe(0);
  });
});
