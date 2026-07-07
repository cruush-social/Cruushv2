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
  | "profile_photo_not_adult_human"
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

export type ModerationCategory = NormalizedModerationLabel | "provider_unavailable";

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
  scope?: "global" | "t4t" | "sapphic" | "gay" | string;
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
