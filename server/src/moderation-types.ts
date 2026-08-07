export const moderationSurfaces = [
  "feed",
  "direct_message",
  "group_message",
  "profile",
  "profile_photo",
  "private_photo"
] as const;

export type ModerationSurface = typeof moderationSurfaces[number];

export type ModerationContentType = "text" | "image";

export type NormalizedModerationLabel =
  | "adult_human_body"
  | "human_present"
  | "animal"
  | "screenshot_or_interface"
  | "profile_photo_not_adult_human"
  | "minor_present"
  | "minor_age_ambiguous"
  | "adult_nudity"
  | "adult_explicit"
  | "pnp_discussion"
  | "drug_sales"
  | "commercial_sex"
  | "underage_sexual"
  | "bestiality"
  | "scat"
  | "gore"
  | "hate_symbol"
  | "hate_speech"
  | "harassment"
  | "threat"
  | "doxxing"
  | "location_privacy"
  | "revenge_porn"
  | "scam"
  | "spam"
  | "chaser_fetishization";

export type ModerationCategory =
  | NormalizedModerationLabel
  | "provider_unavailable"
  | "provider_pending";

export type ModerationSeverity = "none" | "low" | "medium" | "high" | "critical";

export type PolicyDecisionType = "allow" | "reject" | "quarantine" | "remove_existing";

export type FeatureRestriction = {
  feature:
    | "feed_posting"
    | "direct_messages"
    | "group_messages"
    | "group_creation"
    | "profile_updates"
    | "photo_uploads"
    | "map_visibility"
    | "crowd_visibility";
  scope?: "global" | "t4t" | "dyke" | "gay" | string;
  reasonCode: string;
  durationDays?: number;
};

export type EnforcementAction =
  | {
      type: "suspend";
      reasonCode: string;
      permanent?: boolean;
      durationDays?: number;
    }
  | {
      type: "restrict_feature";
      restriction: FeatureRestriction;
    };

export type ProviderLabel = {
  provider_label: string;
  normalized_label: NormalizedModerationLabel;
  confidence: number;
  severity?: ModerationSeverity;
};

export type ProviderModerationResult = {
  provider: string;
  provider_request_id: string;
  labels: ProviderLabel[];
  latency_ms: number;
  recommended_action?: "keep" | "flag" | "remove" | string;
  status?: "complete" | "completed" | "partial" | "pending" | string;
  raw_result?: Record<string, unknown>;
  error?: string;
};

export type PolicyDecision = {
  decision: PolicyDecisionType;
  category?: ModerationCategory;
  severity: ModerationSeverity;
  confidence: number;
  create_evidence_event: boolean;
  evidence_value: number;
  trust_impact: number;
  set_trust_to_zero?: boolean;
  trust_cap?: number;
  penalty_decays: boolean;
  enforcement_action?: EnforcementAction;
  feature_restrictions?: FeatureRestriction[];
  moderation_history_required: boolean;
  reason_code: string;
  user_message_code?: string;
};

export const ALLOW_POLICY_DECISION: PolicyDecision = {
  decision: "allow",
  severity: "none",
  confidence: 0,
  create_evidence_event: false,
  evidence_value: 0,
  trust_impact: 0,
  penalty_decays: true,
  moderation_history_required: false,
  reason_code: "content_allowed"
};

// Stream's check endpoint documents two statuses: "complete" (sync work finished, no async
// work outstanding) and "partial" (sync results are back, async image analysis is still
// running, task_id returned). "pending" and "provider_processing" are kept for older
// records and any provider that reports in-flight work under a different name.
const ASYNC_PENDING_STATUSES = ["partial", "pending", "provider_processing"];

// The provider is still working. No verdict yet, but nothing has gone wrong.
export function providerResultAsyncPending(result: ProviderModerationResult) {
  return !result.error &&
    ASYNC_PENDING_STATUSES.includes((result.status ?? "").toLowerCase());
}

// The provider genuinely failed: transport error, timeout, or a malformed response.
export function providerResultFailed(result: ProviderModerationResult) {
  return Boolean(result.error) || (result.status ?? "").toLowerCase() === "error";
}

// No usable verdict, for either reason. Both cases quarantine and both trigger the
// fallback chain - callers that need to tell an outage from normal async work should use
// the two predicates above rather than this one.
export function providerResultUnusable(result: ProviderModerationResult) {
  return providerResultFailed(result) || providerResultAsyncPending(result);
}
