import type { ProviderModerationResult } from "./moderation-types.js";

export type LegacyMediaClassification = "explicit" | "non_explicit" | "uncertain" | "unknown";

export function classifyLegacyProviderResult(providerResult: ProviderModerationResult): {
  classification: LegacyMediaClassification;
  reason: string;
} {
  if (providerResult.error || !["complete", "completed"].includes(providerResult.status?.toLowerCase() ?? "")) {
    return {
      classification: "unknown",
      reason: "legacy_provider_unavailable"
    };
  }

  if (providerResult.labels.some((label) => ["adult_nudity", "adult_explicit"].includes(label.normalized_label))) {
    return {
      classification: "explicit",
      reason: "legacy_explicit_label"
    };
  }

  const hasHumanProof = providerResult.labels.some((label) =>
    ["adult_human_body", "human_present"].includes(label.normalized_label) && label.confidence >= 0.7
  );

  if (providerResult.recommended_action?.toLowerCase() === "keep" && hasHumanProof) {
    return {
      classification: "non_explicit",
      reason: "legacy_provider_allowed"
    };
  }

  return {
    classification: "uncertain",
    reason: "legacy_provider_uncertain"
  };
}
