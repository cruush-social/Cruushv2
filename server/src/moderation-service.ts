import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import {
  containsBlockedRacialSlur,
  prepareTextForModerationProvider,
  shouldModerateMessageTextWithProvider
} from "./message-keyword-prefilter.js";
import { createModerationProvider } from "./moderation-provider.js";
import {
  type ModerationContentType,
  type ModerationSurface,
  type PolicyDecision,
  type ProviderModerationResult
} from "./moderation-types.js";
import { mapProviderResultToPolicy } from "./policy-mapper.js";
import {
  detectImageChildFaces,
  detectProfilePhotoHuman,
  mergeProfilePhotoSafetyResults
} from "./profile-photo-human-detection.js";
import {
  activeAlphaPhotoUploadBypass
} from "./photo-upload-availability.js";
import { applyPolicyDecision } from "./trust-engine.js";
import {
  persistSevereAccessBan,
  type SevereAccessBanIdentity
} from "./severe-access-bans.js";

type ModerateTextInput = {
  userId: string;
  surface: ModerationSurface;
  text: string;
  contentId?: string;
  contentRef?: Record<string, unknown>;
};

type ModerateImageInput = {
  userId: string;
  surface: ModerationSurface;
  mimeType: string;
  filename?: string;
  imageUrl?: string;
  contentId?: string;
  contentRef?: Record<string, unknown>;
  bytes: Buffer;
  severeAccessBanIdentity?: SevereAccessBanIdentity;
};

type ModerateProfileInput = {
  userId: string;
  fields: Record<string, string | string[] | null | undefined>;
  contentId?: string;
};

type UserReportInput = {
  reporterId: string;
  targetUserId: string | null;
  contentType: "user" | "profile" | "conversation" | "message" | "post" | "profile_photo";
  contentId: string;
  reason: string;
  details?: string;
  conversationId?: string | null;
  messageId?: string | null;
  postId?: string | null;
  mediaObjectId?: string | null;
  profilePhotoUrl?: string | null;
};

type ContentReviewInput = {
  userId: string;
  surface: ModerationSurface;
  contentType: ModerationContentType;
  status: "allowed" | "rejected" | "queued" | "failed_provider_unavailable";
  moderationStatus?: "allowed" | "pending_review" | "blocked" | "removed" | "flagged";
  flaggedReason?: string | null;
  contentId?: string | null;
  contentRef?: Record<string, unknown>;
  providerResult: ProviderModerationResult;
  decision: PolicyDecision;
};

const surfaceSqlLiteral: Record<ModerationSurface, string> = {
  feed: "feed",
  direct_message: "direct_message",
  group_message: "group_message",
  profile: "profile",
  profile_photo: "profile_photo",
  private_photo: "private_photo"
};

const contentTypeSqlLiteral: Record<ModerationContentType, string> = {
  text: "text",
  image: "image"
};

export function approvedContentReviewCte(options: {
  name?: string;
  userIdParam: string;
  surface: ModerationSurface;
  contentType: ModerationContentType;
  fromCte?: string;
  providerParam?: string;
  providerRequestIdParam?: string;
  normalizedLabelsParam?: string;
  policyDecisionParam?: string;
  moderationStatusParam?: string;
  flaggedReasonParam?: string;
  moderationRawResultParam?: string;
  contentIdParam?: string;
  contentRefParam?: string;
}) {
  const name = options.name ?? "moderation_review";
  const providerSql = options.providerParam ?? "'mock'";
  const providerRequestIdSql = options.providerRequestIdParam ?? "'mock-synchronous-allow'";
  const labelsSql = options.normalizedLabelsParam ? `${options.normalizedLabelsParam}::jsonb` : "'[]'::jsonb";
  const policyDecisionSql = options.policyDecisionParam ? `${options.policyDecisionParam}::jsonb` : `'{"decision":"allow","reason_code":"content_allowed"}'::jsonb`;
  const moderationStatusSql = options.moderationStatusParam ?? "'allowed'";
  const flaggedReasonSql = options.flaggedReasonParam ?? "null";
  const moderationRawResultSql = options.moderationRawResultParam ? `${options.moderationRawResultParam}::jsonb` : "'{}'::jsonb";
  const contentIdSql = options.contentIdParam ?? "null";
  const contentRefSql = options.contentRefParam ? `${options.contentRefParam}::jsonb` : "'{}'::jsonb";
  const sourceSql = options.fromCte
    ? `select
      ${options.userIdParam},
      '${surfaceSqlLiteral[options.surface]}',
      '${contentTypeSqlLiteral[options.contentType]}',
      'allowed',
      ${contentIdSql},
      ${contentRefSql},
      ${providerSql},
      ${providerRequestIdSql},
      ${labelsSql},
      ${policyDecisionSql},
      ${moderationStatusSql},
      ${flaggedReasonSql},
      ${providerSql},
      ${moderationRawResultSql},
      now()
    from ${options.fromCte}`
    : `values (
      ${options.userIdParam},
      '${surfaceSqlLiteral[options.surface]}',
      '${contentTypeSqlLiteral[options.contentType]}',
      'allowed',
      ${contentIdSql},
      ${contentRefSql},
      ${providerSql},
      ${providerRequestIdSql},
      ${labelsSql},
      ${policyDecisionSql},
      ${moderationStatusSql},
      ${flaggedReasonSql},
      ${providerSql},
      ${moderationRawResultSql},
      now()
    )`;

  return `${name} as (
    insert into content_reviews (
      user_id,
      surface,
      content_type,
      status,
      content_id,
      content_ref,
      provider,
      provider_request_id,
      normalized_labels,
      policy_decision,
      moderation_status,
      flagged_reason,
      moderation_provider,
      moderation_raw_result,
      completed_at
    )
    ${sourceSql}
    returning id
  )`;
}

async function recordContentReview(app: FastifyInstance, input: ContentReviewInput, db: DbClient = app.db) {
  const id = randomUUID();
  const moderationStatus = input.moderationStatus ?? moderationStatusForReview(input.status, input.decision);
  const flaggedReason = input.flaggedReason ?? (
    input.decision.reason_code === "content_allowed" ? null : input.decision.reason_code
  );

  await db.query(
    `insert into content_reviews (
       id,
       user_id,
       surface,
       content_type,
       status,
       content_id,
       content_ref,
       provider,
       provider_request_id,
       normalized_labels,
       policy_decision,
       moderation_status,
       flagged_reason,
       moderation_provider,
       moderation_raw_result,
       completed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15::jsonb, now())`,
    [
      id,
      input.userId,
      input.surface,
      input.contentType,
      input.status,
      input.contentId ?? null,
      JSON.stringify(input.contentRef ?? {}),
      input.providerResult.provider,
      input.providerResult.provider_request_id,
      JSON.stringify(input.providerResult.labels),
      JSON.stringify(input.decision),
      moderationStatus,
      flaggedReason,
      input.providerResult.provider,
      JSON.stringify(input.providerResult.raw_result ?? {})
    ]
  );

  return id;
}

function userMessageForDecision(decision: PolicyDecision) {
  if (decision.user_message_code === "minor_face_permanent_ban") {
    return "A child face was detected. This account has been permanently banned.";
  }

  if (decision.user_message_code === "profile_photo_not_adult_human") {
    return "Profile photo must be of you.";
  }

  if (decision.user_message_code === "content_pending_review") {
    return "This content could not be saved because automated moderation could not approve it.";
  }

  if (decision.user_message_code === "moderation_delayed") {
    return "Automated moderation is temporarily unavailable. Try again later.";
  }

  if (decision.user_message_code === "feed_content_rejected") {
    return "This feed post could not be published because it violates cruush safety rules.";
  }

  if (decision.user_message_code === "nudity_private_messages_only") {
    return "Nude or sexually explicit photos are only allowed on your own profile or in messages.";
  }

  if (decision.user_message_code === "content_rejected_zero_tolerance") {
    return "This content violates cruush safety rules and cannot be saved.";
  }

  return "This content violates cruush safety rules and cannot be saved.";
}

function hasHumanProof(providerResult: ProviderModerationResult) {
  return providerResult.labels.some((label) =>
    ["adult_human_body", "human_present"].includes(label.normalized_label) &&
    label.confidence >= 0.7
  );
}

function providerResultUnavailable(providerResult: ProviderModerationResult) {
  return Boolean(providerResult.error) ||
    ["partial", "pending", "provider_processing", "error"].includes((providerResult.status ?? "").toLowerCase());
}

function providerResultComplete(providerResult: ProviderModerationResult) {
  return !providerResult.error && ["complete", "completed"].includes((providerResult.status ?? "").toLowerCase());
}

function providerErrorResult(providerName: string, startedAt: number, error: unknown): ProviderModerationResult {
  return {
    provider: providerName,
    provider_request_id: `${providerName}-error-${Date.now().toString(36)}`,
    labels: [],
    latency_ms: Date.now() - startedAt,
    status: "error",
    raw_result: {
      error_name: error instanceof Error ? error.name : "UnknownError"
    },
    error: error instanceof Error ? error.message : "Image moderation failed."
  };
}

// Rekognition backs Stream up whenever it is enabled. Previously this also required the
// Stream automod flag or an active alpha test, so production ran with no fallback at all.
function canUseProfilePhotoRekognitionFallback(app: FastifyInstance, surface: ModerationSurface) {
  return surface === "profile_photo" &&
    app.config.PROFILE_PHOTO_REKOGNITION_ENABLED === true;
}

function isMessagePhotoSurface(surface: ModerationSurface) {
  return surface === "direct_message" || surface === "group_message";
}

function canUseMessagePhotoRekognitionFallback(app: FastifyInstance, surface: ModerationSurface) {
  return isMessagePhotoSurface(surface) &&
    app.config.PROFILE_PHOTO_REKOGNITION_ENABLED === true;
}

function isPhotoUploadSurface(surface: ModerationSurface) {
  return surface === "profile_photo" || isMessagePhotoSurface(surface);
}

// When every moderation provider is unreachable we let the photo through rather than
// stranding it in review. This covers provider outages only — a provider that runs and
// rejects the photo still rejects it.
function canFailOpenOnProviderOutage(app: FastifyInstance, surface: ModerationSurface) {
  return isPhotoUploadSurface(surface) || canUseAlphaPhotoUploadBypass(app, surface);
}

function canUseAlphaPhotoUploadBypass(app: FastifyInstance, surface: ModerationSurface) {
  return isPhotoUploadSurface(surface) &&
    activeAlphaPhotoUploadBypass(app.config);
}

function photoRekognitionFallbackResult(
  primaryResult: ProviderModerationResult,
  safetyResult: ProviderModerationResult
): ProviderModerationResult {
  return {
    ...safetyResult,
    provider: `${primaryResult.provider}+${safetyResult.provider}`,
    provider_request_id: `${primaryResult.provider_request_id}:${safetyResult.provider_request_id}`,
    latency_ms: primaryResult.latency_ms + safetyResult.latency_ms,
    raw_result: {
      primary: primaryResult.raw_result ?? {},
      primary_provider: primaryResult.provider,
      primary_status: primaryResult.status ?? null,
      primary_error: primaryResult.error ?? null,
      rekognition_safety: safetyResult.raw_result ?? {},
      rekognition_fallback: true
    }
  };
}

function alphaPhotoUploadBypassResult(providerResult: ProviderModerationResult): ProviderModerationResult {
  if (providerResult.raw_result?.alpha_photo_upload_bypass === true) {
    return providerResult;
  }

  const { error: _error, ...resultWithoutError } = providerResult;

  return {
    ...resultWithoutError,
    provider: `${providerResult.provider}+alpha_upload_bypass`,
    provider_request_id: `${providerResult.provider_request_id}:alpha-photo-upload`,
    labels: [],
    status: "completed",
    recommended_action: "keep",
    raw_result: {
      provider_result: providerResult.raw_result ?? {},
      provider_status: providerResult.status ?? null,
      provider_error: providerResult.error ?? null,
      alpha_photo_upload_bypass: true
    }
  };
}

function isProviderUnavailableDecision(decision: PolicyDecision) {
  return decision.decision === "quarantine" &&
    (decision.category === "provider_unavailable" || decision.reason_code === "provider_unavailable");
}

function rejectProfilePhotoWithoutAdultHuman(providerResult: ProviderModerationResult): {
  providerResult: ProviderModerationResult;
  decision: PolicyDecision;
} {
  return {
    providerResult: {
      ...providerResult,
      labels: [
        ...providerResult.labels,
        {
          provider_label: "cruush_profile_photo_missing_adult_human_body",
          normalized_label: "profile_photo_not_adult_human",
          confidence: 1,
          severity: "high"
        }
      ],
      raw_result: {
        ...(providerResult.raw_result ?? {}),
        cruush_profile_photo_gate: "missing_adult_human_body"
      }
    },
    decision: {
      decision: "reject",
      category: "profile_photo_not_adult_human",
      severity: "high",
      confidence: 1,
      create_evidence_event: false,
      evidence_value: 0,
      trust_impact: 0,
      penalty_decays: true,
      moderation_history_required: true,
      reason_code: "profile_photo_not_adult_human",
      user_message_code: "profile_photo_not_adult_human"
    }
  };
}

export type ProfilePhotoAdultHumanGateOutcome = {
  status: "resolved" | "manual_review_required";
  providerResult: ProviderModerationResult;
  decision: PolicyDecision;
};

export function resolveProfilePhotoAdultHumanGate(
  providerResult: ProviderModerationResult,
  decision: PolicyDecision,
  options: { allowManualReview: boolean }
): ProfilePhotoAdultHumanGateOutcome {
  if (decision.decision !== "allow" || hasHumanProof(providerResult)) {
    return {
      status: "resolved",
      providerResult,
      decision
    };
  }

  if (
    options.allowManualReview &&
    ["complete", "completed"].includes(providerResult.status?.toLowerCase() ?? "") &&
    providerResult.recommended_action?.toLowerCase() === "keep"
  ) {
    return {
      status: "manual_review_required",
      providerResult: {
        ...providerResult,
        raw_result: {
          ...(providerResult.raw_result ?? {}),
          cruush_profile_photo_gate: "manual_review_required"
        }
      },
      decision: {
        decision: "quarantine",
        category: "profile_photo_not_adult_human",
        severity: "medium",
        confidence: 1,
        create_evidence_event: false,
        evidence_value: 0,
        trust_impact: 0,
        penalty_decays: true,
        moderation_history_required: false,
        reason_code: "bank_profile_photo_manual_review_required",
        user_message_code: "content_pending_review"
      }
    };
  }

  const rejection = rejectProfilePhotoWithoutAdultHuman(providerResult);
  return {
    status: "resolved",
    ...rejection
  };
}

function moderationStatusForReview(status: ContentReviewInput["status"], decision: PolicyDecision) {
  if (status === "allowed") {
    return "allowed";
  }

  if (status === "queued" || status === "failed_provider_unavailable" || decision.decision === "quarantine") {
    return "pending_review";
  }

  if (decision.decision === "remove_existing") {
    return "removed";
  }

  return "blocked";
}

async function handlePolicyDecision(
  app: FastifyInstance,
  userId: string,
  surface: ModerationSurface,
  contentType: ModerationContentType,
  providerResult: ProviderModerationResult,
  decision: PolicyDecision,
  options: {
    contentId?: string | null;
    contentRef?: Record<string, unknown>;
    severeAccessBanIdentity?: SevereAccessBanIdentity;
  } = {}
) {
  if (decision.decision === "allow") {
    return {
      decision,
      providerResult
    };
  }

  if (decision.decision === "quarantine") {
    await recordContentReview(app, {
      userId,
      surface,
      contentType,
      status: "queued",
      contentId: options.contentId,
      contentRef: options.contentRef,
      providerResult,
      decision
    });

    throw new ApiError(503, "MODERATION_UNAVAILABLE", userMessageForDecision(decision));
  }

  const contentReviewId = await recordContentReview(app, {
    userId,
    surface,
    contentType,
    status: "rejected",
    contentId: options.contentId,
    contentRef: options.contentRef,
    providerResult,
    decision
  });

  await applyPolicyDecision(app.db, userId, decision, {
    contentReviewId,
    surface,
    contentType,
    source: "ai",
    metadata: {
      provider: providerResult.provider,
      providerRequestId: providerResult.provider_request_id
    }
  });

  if (decision.reason_code === "minor_face_detected") {
    await persistSevereAccessBan(
      app.db,
      userId,
      decision.reason_code,
      options.severeAccessBanIdentity
    );
  }

  throw new ApiError(
    decision.enforcement_action?.type === "suspend" ? 403 : 400,
    "CONTENT_REJECTED",
    userMessageForDecision(decision)
  );
}

export async function moderateTextOrReject(app: FastifyInstance, input: ModerateTextInput) {
  const providerResult: ProviderModerationResult = containsBlockedRacialSlur(input.text)
    ? {
        provider: "local_text_policy",
        provider_request_id: "local-text-policy-blocked-racial-slur",
        labels: [{
          provider_label: "blocked_hard_r_racial_slur",
          normalized_label: "hate_speech",
          confidence: 1,
          severity: "high"
        }],
        latency_ms: 0,
        raw_result: {
          matchedCategories: ["hate_or_extremism"]
        }
      }
    : await createModerationProvider(app.config).moderateText({
        ...input,
        text: prepareTextForModerationProvider(input.text)
      });
  const decision = mapProviderResultToPolicy({
    surface: input.surface,
    contentType: "text",
    providerResult
  });

  return handlePolicyDecision(app, input.userId, input.surface, "text", providerResult, decision, {
    contentId: input.contentId,
    contentRef: input.contentRef
  });
}

export async function moderateMessageTextOrAllowByKeyword(app: FastifyInstance, input: ModerateTextInput) {
  const prefilter = shouldModerateMessageTextWithProvider(input.text);

  if (prefilter.shouldModerate) {
    return moderateTextOrReject(app, input);
  }

  return {
    decision: {
      decision: "allow",
      severity: "none",
      confidence: 1,
      create_evidence_event: false,
      evidence_value: 0,
      trust_impact: 0,
      penalty_decays: true,
      moderation_history_required: false,
      reason_code: "content_allowed"
    } as PolicyDecision,
    providerResult: {
      provider: "keyword_prefilter",
      provider_request_id: "keyword-prefilter-allow",
      labels: [],
      latency_ms: 0,
      raw_result: {
        matchedCategories: prefilter.matchedCategories,
        streamCallSkipped: true
      }
    } as ProviderModerationResult
  };
}

export async function moderateImageOrReject(
  app: FastifyInstance,
  input: ModerateImageInput,
  options: { allowProfilePhotoManualReview?: boolean } = {}
) {
  const provider = createModerationProvider(app.config);
  const failOpenOnProviderOutage = canFailOpenOnProviderOutage(app, input.surface);
  const useProfilePhotoRekognitionFallback = canUseProfilePhotoRekognitionFallback(app, input.surface);
  const useMessagePhotoRekognitionFallback = canUseMessagePhotoRekognitionFallback(app, input.surface);
  const usePhotoRekognitionFallback = useProfilePhotoRekognitionFallback || useMessagePhotoRekognitionFallback;
  const startedAt = Date.now();
  let providerResult: ProviderModerationResult;

  try {
    providerResult = await provider.moderateImage(input);
  } catch (error) {
    if (!failOpenOnProviderOutage) {
      throw error;
    }

    // Record the outage and continue: the Rekognition fallback below still gets a chance
    // to score this image before anything decides to fail open.
    app.log.error(
      { err: error, provider: provider.name, surface: input.surface },
      "image moderation provider failed"
    );
    providerResult = providerErrorResult(provider.name, startedAt, error);
  }

  if (app.config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true || usePhotoRekognitionFallback) {
    const safetyResult = input.surface === "profile_photo"
      ? await detectProfilePhotoHuman(app.config, input.bytes)
      : await detectImageChildFaces(app.config, input.bytes);

    providerResult = usePhotoRekognitionFallback &&
      (providerResultUnavailable(providerResult) || providerResult.provider === "mock") &&
      providerResultComplete(safetyResult)
      ? photoRekognitionFallbackResult(providerResult, safetyResult)
      : mergeProfilePhotoSafetyResults(providerResult, safetyResult);
  }

  let decision = mapProviderResultToPolicy({
    surface: input.surface,
    contentType: "image",
    providerResult
  });
  let resolvedProviderResult = providerResult;
  let failedOpenOnProviderOutage = false;

  // Every provider is unreachable, including the Rekognition fallback. Let the upload
  // through instead of parking it in a review queue nobody can clear.
  if (failOpenOnProviderOutage && isProviderUnavailableDecision(decision)) {
    failedOpenOnProviderOutage = true;
    app.log.warn(
      {
        provider: providerResult.provider,
        surface: input.surface,
        userId: input.userId,
        providerError: providerResult.error ?? null
      },
      "photo moderation unavailable, allowing upload"
    );
    resolvedProviderResult = alphaPhotoUploadBypassResult(providerResult);
    decision = mapProviderResultToPolicy({
      surface: input.surface,
      contentType: "image",
      providerResult: resolvedProviderResult
    });
  }

  if (input.surface === "profile_photo") {
    // Only skip the adult-human requirement when we actually failed open. A provider that
    // ran and found no adult human must still fall through to the gate below.
    const skipAdultHumanGateForAlphaUpload = failedOpenOnProviderOutage &&
      decision.decision === "allow" &&
      !hasHumanProof(resolvedProviderResult);

    if (skipAdultHumanGateForAlphaUpload) {
      resolvedProviderResult = alphaPhotoUploadBypassResult(resolvedProviderResult);
    } else {
      const gate = resolveProfilePhotoAdultHumanGate(resolvedProviderResult, decision, {
        allowManualReview: options.allowProfilePhotoManualReview === true
      });

      if (gate.status === "manual_review_required") {
        return gate;
      }

      decision = gate.decision;
      resolvedProviderResult = gate.providerResult;
    }
  }

  return handlePolicyDecision(app, input.userId, input.surface, "image", resolvedProviderResult, decision, {
    contentId: input.contentId,
    contentRef: input.contentRef,
    severeAccessBanIdentity: input.severeAccessBanIdentity
  });
}

function profileModerationText(fields: Record<string, string | string[] | null | undefined>) {
  return Object.values(fields)
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value;
      }

      return value ? [value] : [];
    })
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
}

export async function moderateProfileOrReject(app: FastifyInstance, input: ModerateProfileInput) {
  const text = profileModerationText(input.fields);

  if (!text) {
    return {
      decision: {
        decision: "allow",
        severity: "none",
        confidence: 0,
        create_evidence_event: false,
        evidence_value: 0,
        trust_impact: 0,
        penalty_decays: true,
        moderation_history_required: false,
        reason_code: "content_allowed"
      } as PolicyDecision,
      providerResult: {
        provider: "none",
        provider_request_id: "empty-profile-text",
        labels: [],
        latency_ms: 0
      } as ProviderModerationResult
    };
  }

  return moderateTextOrReject(app, {
    userId: input.userId,
    surface: "profile",
    text,
    contentId: input.contentId ?? input.userId,
    contentRef: {
      fields: Object.keys(input.fields)
    }
  });
}

export async function createUserReport(app: FastifyInstance, input: UserReportInput, db: DbClient = app.db) {
  const reviewUserId = input.targetUserId ?? input.reporterId;
  const reviewId = await recordContentReview(app, {
    userId: reviewUserId,
    surface: input.contentType === "profile_photo"
      ? "profile_photo"
      : input.contentType === "post"
      ? "feed"
      : input.contentType === "profile" || input.contentType === "user"
        ? "profile"
        : "direct_message",
    contentType: input.contentType === "profile_photo" ? "image" : "text",
    status: "queued",
    moderationStatus: "flagged",
    flaggedReason: input.reason,
    contentId: input.contentId,
    contentRef: {
      reportId: input.contentId,
      reporterId: input.reporterId,
      targetUserId: input.targetUserId,
      targetType: input.contentType,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      postId: input.postId ?? null,
      mediaObjectId: input.mediaObjectId ?? null,
      profilePhotoUrl: input.profilePhotoUrl ?? null,
      reason: input.reason,
      hasDetails: Boolean(input.details?.trim())
    },
    providerResult: {
      provider: "user_report",
      provider_request_id: input.contentId,
      labels: [],
      latency_ms: 0,
      raw_result: {
        reason: input.reason,
        targetType: input.contentType
      }
    },
    decision: {
      decision: "quarantine",
      category: "provider_unavailable",
      severity: "medium",
      confidence: 1,
      create_evidence_event: false,
      evidence_value: 0,
      trust_impact: 0,
      penalty_decays: true,
      moderation_history_required: true,
      reason_code: input.reason
    }
  }, db);

  return reviewId;
}
