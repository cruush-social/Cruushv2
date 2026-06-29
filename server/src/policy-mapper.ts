import type {
  EnforcementAction,
  FeatureRestriction,
  ModerationContentType,
  ModerationSeverity,
  ModerationSurface,
  NormalizedModerationLabel,
  PolicyDecision,
  ProviderLabel,
  ProviderModerationResult
} from "./moderation-types.js";
import { ALLOW_POLICY_DECISION } from "./moderation-types.js";

type PolicyMapperInput = {
  surface: ModerationSurface;
  contentType: ModerationContentType;
  providerResult: ProviderModerationResult;
};

const severityRank: Record<ModerationSeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const decisionRank: Record<PolicyDecision["decision"], number> = {
  allow: 0,
  remove_existing: 1,
  quarantine: 2,
  reject: 3
};

function baseDecision(overrides: Partial<PolicyDecision>): PolicyDecision {
  return {
    ...ALLOW_POLICY_DECISION,
    ...overrides
  };
}

function suspension(reasonCode: string, permanent = false): EnforcementAction {
  return {
    type: "suspend",
    reasonCode,
    permanent
  };
}

function restriction(restriction: FeatureRestriction): EnforcementAction {
  return {
    type: "restrict_feature",
    restriction
  };
}

function isPrivateMessageSurface(surface: ModerationSurface) {
  return surface === "direct_message" || surface === "group_message";
}

function isPhotoSurface(surface: ModerationSurface, contentType: ModerationContentType) {
  return contentType === "image" || surface === "profile_photo" || surface === "private_photo";
}

function evidenceOnly(label: ProviderLabel, evidenceValue: number): PolicyDecision {
  return baseDecision({
    decision: "allow",
    category: label.normalized_label,
    severity: label.severity ?? "low",
    confidence: label.confidence,
    create_evidence_event: true,
    evidence_value: evidenceValue,
    moderation_history_required: false,
    reason_code: `${label.normalized_label}_evidence_only`
  });
}

function thresholdedReject(label: ProviderLabel, input: {
  evidenceValue: number;
  trustImpact: number;
  reasonCode: string;
  trustCap?: number;
  enforcementAction?: EnforcementAction;
  featureRestrictions?: FeatureRestriction[];
  penaltyDecays?: boolean;
  userMessageCode?: string;
}): PolicyDecision {
  if (label.confidence < 0.7) {
    return baseDecision({
      category: label.normalized_label,
      confidence: label.confidence,
      reason_code: `${label.normalized_label}_below_threshold`
    });
  }

  if (label.confidence < 0.85) {
    return evidenceOnly(label, Math.min(input.evidenceValue, 75));
  }

  return baseDecision({
    decision: "reject",
    category: label.normalized_label,
    severity: label.severity ?? "medium",
    confidence: label.confidence,
    create_evidence_event: input.evidenceValue > 0,
    evidence_value: input.evidenceValue,
    trust_impact: input.trustImpact,
    trust_cap: input.trustCap,
    penalty_decays: input.penaltyDecays ?? true,
    enforcement_action: input.enforcementAction,
    feature_restrictions: input.featureRestrictions,
    moderation_history_required: true,
    reason_code: input.reasonCode,
    user_message_code: input.userMessageCode ?? "content_rejected"
  });
}

function zeroTolerance(label: ProviderLabel, reasonCode: string): PolicyDecision {
  if (label.confidence < 0.7) {
    return evidenceOnly(label, 75);
  }

  return baseDecision({
    decision: "reject",
    category: label.normalized_label,
    severity: "critical",
    confidence: label.confidence,
    create_evidence_event: true,
    evidence_value: 250,
    trust_impact: -100,
    set_trust_to_zero: true,
    trust_cap: 0,
    penalty_decays: false,
    enforcement_action: suspension(reasonCode, true),
    moderation_history_required: true,
    reason_code: reasonCode,
    user_message_code: "content_rejected_zero_tolerance"
  });
}

function mapLabel(label: ProviderLabel, surface: ModerationSurface, contentType: ModerationContentType): PolicyDecision {
  const normalizedLabel: NormalizedModerationLabel = label.normalized_label;

  if (normalizedLabel === "adult_nudity" || normalizedLabel === "adult_explicit") {
    if (surface === "feed" && label.confidence >= 0.85) {
      return baseDecision({
        decision: "reject",
        category: normalizedLabel,
        severity: "low",
        confidence: label.confidence,
        create_evidence_event: false,
        evidence_value: 0,
        trust_impact: 0,
        penalty_decays: true,
        moderation_history_required: true,
        reason_code: "feed_explicit_adult_content",
        user_message_code: "feed_content_rejected"
      });
    }

    return baseDecision({
      category: normalizedLabel,
      severity: label.severity ?? "low",
      confidence: label.confidence,
      reason_code: "adult_content_allowed"
    });
  }

  if (normalizedLabel === "pnp_discussion") {
    if (isPrivateMessageSurface(surface)) {
      return baseDecision({
        category: normalizedLabel,
        severity: label.severity ?? "low",
        confidence: label.confidence,
        reason_code: "private_pnp_discussion_allowed"
      });
    }

    return thresholdedReject(label, {
      evidenceValue: 10,
      trustImpact: 0,
      reasonCode: "public_pnp_discussion",
      featureRestrictions: [{
        feature: "feed_posting",
        scope: "global",
        reasonCode: "public_pnp_discussion",
        durationDays: 7
      }],
      userMessageCode: "feed_content_rejected"
    });
  }

  if (normalizedLabel === "drug_sales") {
    return thresholdedReject(label, {
      evidenceValue: 220,
      trustImpact: -50,
      reasonCode: "drug_sales",
      trustCap: 60,
      enforcementAction: suspension("drug_sales")
    });
  }

  if (normalizedLabel === "commercial_sex") {
    return thresholdedReject(label, {
      evidenceValue: 150,
      trustImpact: -30,
      reasonCode: "commercial_sex_solicitation",
      trustCap: 70
    });
  }

  if (normalizedLabel === "underage_sexual") {
    return zeroTolerance(label, "underage_sexual_content");
  }

  if (normalizedLabel === "bestiality") {
    return zeroTolerance(label, "bestiality_content");
  }

  if (normalizedLabel === "revenge_porn") {
    return zeroTolerance(label, "revenge_porn");
  }

  if (normalizedLabel === "gore") {
    return thresholdedReject(label, {
      evidenceValue: 100,
      trustImpact: isPhotoSurface(surface, contentType) ? -25 : 0,
      reasonCode: "gore_content"
    });
  }

  if (normalizedLabel === "hate_symbol" || normalizedLabel === "hate_speech") {
    return thresholdedReject(label, {
      evidenceValue: 150,
      trustImpact: -40,
      reasonCode: normalizedLabel,
      trustCap: 50
    });
  }

  if (normalizedLabel === "threat") {
    return thresholdedReject(label, {
      evidenceValue: 175,
      trustImpact: -60,
      reasonCode: "credible_threat",
      trustCap: 50,
      enforcementAction: label.confidence >= 0.9 ? suspension("credible_threat") : undefined
    });
  }

  if (normalizedLabel === "harassment") {
    return thresholdedReject(label, {
      evidenceValue: 100,
      trustImpact: -20,
      reasonCode: "harassment"
    });
  }

  if (normalizedLabel === "doxxing" || normalizedLabel === "location_privacy") {
    return thresholdedReject(label, {
      evidenceValue: 150,
      trustImpact: -40,
      reasonCode: normalizedLabel,
      featureRestrictions: [{
        feature: "map_visibility",
        scope: "global",
        reasonCode: normalizedLabel,
        durationDays: 30
      }],
      enforcementAction: restriction({
        feature: "map_visibility",
        scope: "global",
        reasonCode: normalizedLabel,
        durationDays: 30
      })
    });
  }

  if (normalizedLabel === "spam" || normalizedLabel === "scam") {
    return thresholdedReject(label, {
      evidenceValue: 100,
      trustImpact: -20,
      reasonCode: normalizedLabel,
      featureRestrictions: [{
        feature: "direct_messages",
        scope: "global",
        reasonCode: normalizedLabel,
        durationDays: 7
      }]
    });
  }

  if (normalizedLabel === "chaser_fetishization") {
    if (label.confidence < 0.7) {
      return evidenceOnly(label, 25);
    }

    return baseDecision({
      decision: "quarantine",
      category: normalizedLabel,
      severity: label.severity ?? "medium",
      confidence: label.confidence,
      create_evidence_event: true,
      evidence_value: 50,
      trust_impact: 0,
      penalty_decays: true,
      moderation_history_required: true,
      reason_code: "chaser_fetishization_pending_review",
      user_message_code: "content_pending_review"
    });
  }

  return baseDecision({
    category: normalizedLabel,
    severity: label.severity ?? "low",
    confidence: label.confidence,
    reason_code: `${normalizedLabel}_allowed`
  });
}

function chooseDecision(current: PolicyDecision, next: PolicyDecision) {
  const currentDecisionRank = decisionRank[current.decision];
  const nextDecisionRank = decisionRank[next.decision];

  if (nextDecisionRank !== currentDecisionRank) {
    return nextDecisionRank > currentDecisionRank ? next : current;
  }

  const currentSeverityRank = severityRank[current.severity];
  const nextSeverityRank = severityRank[next.severity];

  if (nextSeverityRank !== currentSeverityRank) {
    return nextSeverityRank > currentSeverityRank ? next : current;
  }

  return next.confidence > current.confidence ? next : current;
}

export function mapProviderResultToPolicy(input: PolicyMapperInput): PolicyDecision {
  const recommendedAction = input.providerResult.recommended_action?.toLowerCase();

  if (
    input.providerResult.error ||
    ["partial", "pending", "provider_processing", "error"].includes((input.providerResult.status ?? "").toLowerCase())
  ) {
    return baseDecision({
      decision: "quarantine",
      category: "provider_unavailable",
      severity: "medium",
      confidence: 1,
      create_evidence_event: false,
      evidence_value: 0,
      trust_impact: 0,
      moderation_history_required: true,
      reason_code: "provider_unavailable",
      user_message_code: "moderation_delayed"
    });
  }

  const decision = input.providerResult.labels
    .map((label) => mapLabel(label, input.surface, input.contentType))
    .reduce(chooseDecision, ALLOW_POLICY_DECISION);

  if (decision.decision === "allow" && recommendedAction === "flag") {
    return baseDecision({
      decision: "quarantine",
      category: decision.category ?? input.providerResult.labels[0]?.normalized_label,
      severity: decision.severity === "none" ? "medium" : decision.severity,
      confidence: decision.confidence || 0.8,
      create_evidence_event: decision.create_evidence_event,
      evidence_value: decision.evidence_value,
      trust_impact: 0,
      penalty_decays: true,
      moderation_history_required: true,
      reason_code: "provider_flagged_for_review",
      user_message_code: "content_pending_review"
    });
  }

  if (decision.decision === "allow" && recommendedAction === "remove") {
    return baseDecision({
      decision: "reject",
      category: decision.category ?? input.providerResult.labels[0]?.normalized_label ?? "harassment",
      severity: decision.severity === "none" ? "high" : decision.severity,
      confidence: decision.confidence || 0.88,
      create_evidence_event: true,
      evidence_value: Math.max(decision.evidence_value, 100),
      trust_impact: Math.min(decision.trust_impact, -20),
      penalty_decays: true,
      moderation_history_required: true,
      reason_code: "provider_recommended_remove",
      user_message_code: "content_rejected"
    });
  }

  return decision;
}
