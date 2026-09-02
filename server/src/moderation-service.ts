import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sendAgeSuspensionAppealEmail, sendAgeSuspensionInboxEmail } from "./mailer.js";
import type { DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import {
  containsBlockedRacialSlur,
  prepareTextForModerationProvider,
  shouldModerateMessageTextWithProvider
} from "./message-keyword-prefilter.js";
import {
  createModerationProviderOrUnavailable,
  MockModerationProvider
} from "./moderation-provider.js";
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
  detectPublicImageSafety,
  mergeProfilePhotoSafetyResults
} from "./profile-photo-human-detection.js";
import {
  activeAlphaPhotoUploadBypass
} from "./photo-upload-availability.js";
import { applyPolicyDecision } from "./trust-engine.js";
import {
  type SevereAccessBanIdentity
} from "./severe-access-bans.js";
import {
  recordModerationSystemError,
  resolveModerationSystemErrors
} from "./moderation-system-errors.js";

type ModerateTextInput = {
  userId: string;
  surface: ModerationSurface;
  text: string;
  contentId?: string;
  contentRef?: Record<string, unknown>;
  persistAllowedReview?: boolean;
};

type TextModerationResult = {
  decision: PolicyDecision;
  providerResult: ProviderModerationResult;
  moderationStatus?: "allowed" | "flagged";
  flaggedReason?: string | null;
};

type ModerateImageInput = {
  userId: string;
  surface: ModerationSurface;
  mimeType: string;
  filename?: string;
  imageUrl?: string;
  contentId?: string;
  providerTaskId?: string;
  contentRef?: Record<string, unknown>;
  bytes: Buffer;
  severeAccessBanIdentity?: SevereAccessBanIdentity;
};

class ModerationUnavailableError extends ApiError {
  readonly providerResult: ProviderModerationResult;

  constructor(message: string, providerResult: ProviderModerationResult) {
    super(503, "MODERATION_UNAVAILABLE", message);
    this.name = "ModerationUnavailableError";
    this.providerResult = providerResult;
  }
}

export function providerResultFromModerationUnavailableError(error: unknown) {
  return error instanceof ModerationUnavailableError ? error.providerResult : undefined;
}

class ModerationRejectedError extends ApiError {
  readonly contentReviewId: string;
  readonly decision: PolicyDecision;
  readonly providerResult: ProviderModerationResult;

  constructor(input: {
    contentReviewId: string;
    decision: PolicyDecision;
    message: string;
    providerResult: ProviderModerationResult;
    statusCode: number;
  }) {
    super(input.statusCode, "CONTENT_REJECTED", input.message);
    this.name = "ModerationRejectedError";
    this.contentReviewId = input.contentReviewId;
    this.decision = input.decision;
    this.providerResult = input.providerResult;
  }
}

export function moderationRejectionFromError(error: unknown) {
  return error instanceof ModerationRejectedError ? error : null;
}

type ModerateProfileInput = {
  userId: string;
  fields: Record<string, string | string[] | null | undefined>;
  contentId?: string;
};

type UserReportInput = {
  reporterId: string;
  targetUserId: string | null;
  contentType: "user" | "profile" | "conversation" | "message" | "post" | "profile_photo" | "place" | "place_message";
  contentId: string;
  reason: string;
  details?: string;
  conversationId?: string | null;
  messageId?: string | null;
  postId?: string | null;
  mediaObjectId?: string | null;
  profilePhotoUrl?: string | null;
  placeId?: string | null;
  placeMessageId?: string | null;
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

export function userMessageForDecision(
  decision: PolicyDecision,
  contentType: ModerationContentType = "image"
) {
  if (decision.user_message_code === "minor_face_review_suspension") {
    return "A minor face was detected. This account has been suspended for human review.";
  }

  if (decision.user_message_code === "profile_photo_not_adult_human") {
    return "Profile photo must show you or your gear.";
  }

  if (decision.user_message_code === "content_pending_review") {
    return "This content could not be saved because automated moderation could not approve it.";
  }

  if (decision.user_message_code === "moderation_delayed") {
    if (contentType === "text") {
      return "Nothing was saved because we could not check this text for harmful content. Try again in a few minutes, or contact reports@cruush.app if it keeps happening.";
    }

    return "Nothing was saved because we could not check this photo for harmful content. Try again in a few minutes, or contact reports@cruush.app if it keeps happening.";
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

const HUMAN_PROOF_CONFIDENCE = 0.7;
// A completed provider pass that recommends keeping the photo has already
// cleared every blocking rule, so a softer human signal is enough to confirm a
// person is in frame instead of sending an ordinary selfie to manual review.
const KEPT_PHOTO_HUMAN_PROOF_CONFIDENCE = 0.5;

function providerCompletedWithKeep(providerResult: ProviderModerationResult) {
  return ["complete", "completed"].includes(providerResult.status?.toLowerCase() ?? "") &&
    providerResult.recommended_action?.toLowerCase() === "keep";
}

function hasHumanProof(providerResult: ProviderModerationResult) {
  const requiredConfidence = providerCompletedWithKeep(providerResult)
    ? KEPT_PHOTO_HUMAN_PROOF_CONFIDENCE
    : HUMAN_PROOF_CONFIDENCE;

  return providerResult.labels.some((label) =>
    ["adult_human_body", "human_present"].includes(label.normalized_label) &&
    label.confidence >= requiredConfidence
  );
}

function hasAllowedProfileGearProof(providerResult: ProviderModerationResult) {
  return providerResult.labels.some((label) => (
    label.normalized_label === "profile_photo_not_adult_human"
  ));
}

function hasCompleteStreamKeep(providerResult: ProviderModerationResult) {
  const raw = providerResult.raw_result;
  const streamRaw = asRecord(raw?.stream) ?? asRecord(raw?.primary);
  const provider = asStringOrNull(raw?.stream_provider) ??
    asStringOrNull(raw?.primary_provider) ??
    providerResult.provider;
  const status = asStringOrNull(raw?.stream_status) ??
    asStringOrNull(raw?.primary_status) ??
    providerResult.status ?? null;
  const action = asStringOrNull(streamRaw?.recommended_action) ?? providerResult.recommended_action ?? null;

  return provider === "stream" &&
    ["complete", "completed"].includes(status?.toLowerCase() ?? "") &&
    action?.toLowerCase() === "keep";
}

function providerResultUnavailable(providerResult: ProviderModerationResult) {
  return Boolean(providerResult.error) ||
    ["partial", "pending", "provider_processing", "error"].includes((providerResult.status ?? "").toLowerCase());
}

function providerResultComplete(providerResult: ProviderModerationResult) {
  return !providerResult.error && ["complete", "completed"].includes((providerResult.status ?? "").toLowerCase());
}

function providerErrorMetadata(error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown } | null;
  const status = Number(candidate?.statusCode ?? candidate?.status);
  const code = typeof candidate?.code === "string" ? candidate.code : null;
  return {
    error_name: error instanceof Error ? error.name : "UnknownError",
    ...(Number.isFinite(status) ? { status_code: status } : {}),
    ...(code ? { error_code: code } : {})
  };
}

function providerErrorResult(providerName: string, startedAt: number, error: unknown): ProviderModerationResult {
  return {
    provider: providerName,
    provider_request_id: `${providerName}-error-${Date.now().toString(36)}`,
    labels: [],
    latency_ms: Date.now() - startedAt,
    status: "error",
    raw_result: providerErrorMetadata(error),
    error: error instanceof Error ? error.message : "Image moderation failed."
  };
}

function providerFailureCode(raw: Record<string, unknown> | undefined, fallback: string) {
  const status = raw && typeof raw.status_code === "number" ? raw.status_code : null;
  const code = raw && typeof raw.error_code === "string" ? raw.error_code : null;
  const name = raw && typeof raw.error_name === "string" ? raw.error_name : null;
  const candidate = status !== null ? `http_${status}` : code ?? name ?? fallback;
  return candidate.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120) || fallback;
}

type ProviderHealthOutcome = {
  provider: string;
  status: string | null;
  error: string | null;
  rawResult: Record<string, unknown> | undefined;
  providerRequestId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asStringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function providerHealthOutcomes(providerResult: ProviderModerationResult): ProviderHealthOutcome[] {
  const raw = providerResult.raw_result;
  const primaryProvider = asStringOrNull(raw?.primary_provider);
  const streamProvider = asStringOrNull(raw?.stream_provider);
  const primaryOrStream = primaryProvider ?? streamProvider;

  if (primaryOrStream) {
    const primary = primaryProvider ? "primary" : "stream";
    return [
      {
        provider: primaryOrStream,
        status: asStringOrNull(raw?.[`${primary}_status`]),
        error: asStringOrNull(raw?.[`${primary}_error`]),
        rawResult: asRecord(raw?.[primary]),
        providerRequestId: asStringOrNull(raw?.[`${primary}_provider_request_id`])
      },
      {
        provider: asStringOrNull(raw?.rekognition_provider) ?? "aws_rekognition",
        status: asStringOrNull(raw?.rekognition_status),
        error: asStringOrNull(raw?.rekognition_error),
        rawResult: asRecord(raw?.rekognition_safety),
        providerRequestId: asStringOrNull(raw?.rekognition_provider_request_id)
      }
    ];
  }

  return [{
    provider: providerResult.provider,
    status: providerResult.status ?? null,
    error: providerResult.error ?? null,
    rawResult: raw,
    providerRequestId: providerResult.provider_request_id
  }];
}

async function syncModerationSystemErrors(
  app: FastifyInstance,
  input: {
    surface: ModerationSurface;
    contentType: ModerationContentType;
    contentId?: string | null;
    providerResult: ProviderModerationResult;
  }
) {
  for (const outcome of providerHealthOutcomes(input.providerResult)) {
    const status = outcome.status?.toLowerCase();
    // A partial Stream image response is normal asynchronous work. The asset stays held
    // for retry, but it is not an infrastructure incident and should not flood this view.
    if (status === "partial" || status === "pending" || status === "provider_processing") continue;

    try {
      if (status === "error" || outcome.error) {
        await recordModerationSystemError(app.db, {
          provider: outcome.provider,
          surface: input.surface,
          contentType: input.contentType,
          errorCode: providerFailureCode(outcome.rawResult, "provider_unavailable"),
          error: outcome.error ?? "Moderation provider unavailable.",
          contentId: input.contentId ?? null,
          providerRequestId: outcome.providerRequestId
        });
      } else {
        await resolveModerationSystemErrors(app.db, {
          provider: outcome.provider,
          surface: input.surface,
          contentType: input.contentType
        });
      }
    } catch (error) {
      app.log?.warn?.({ err: error, provider: outcome.provider, surface: input.surface, contentType: input.contentType }, "moderation system-error health update failed");
    }
  }
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

function canUseFeedImageRekognitionFallback(app: FastifyInstance, surface: ModerationSurface) {
  return surface === "feed" &&
    app.config.PROFILE_PHOTO_REKOGNITION_ENABLED === true;
}

function isPhotoUploadSurface(surface: ModerationSurface) {
  return surface === "profile_photo" || isMessagePhotoSurface(surface);
}

// Failing open is limited to the explicit alpha-test bypass and never applies to
// ordinary production uploads.
//
// A total provider outage yields no labels at all, so there is no way to tell adult
// nudity - which this app allows - from an animal, gore, or a hate symbol, which it
// never allows. Publishing blind would admit all of them, and on profile photos it
// also skips the adult-human gate below. Rejecting during an outage is recoverable;
// a published hate symbol is not.
function canFailOpenOnProviderOutage(app: FastifyInstance, surface: ModerationSurface) {
  return canUseAlphaPhotoUploadBypass(app, surface);
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
      primary_provider_request_id: primaryResult.provider_request_id,
      rekognition_provider: safetyResult.provider,
      rekognition_status: safetyResult.status ?? null,
      rekognition_error: safetyResult.error ?? null,
      rekognition_provider_request_id: safetyResult.provider_request_id,
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
  if (
    decision.decision !== "allow" ||
    hasHumanProof(providerResult) ||
    hasAllowedProfileGearProof(providerResult) ||
    hasCompleteStreamKeep(providerResult)
  ) {
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


const AGE_SUSPENSION_REASON_CODES = new Set(["minor_face_detected"]);

/**
 * An age-related suspension always offers a human review, so tell the person it
 * happened and where to send their details. Delivery never blocks enforcement.
 */
async function notifyAgeSuspensionAppeal(
  app: FastifyInstance,
  userId: string,
  decision: PolicyDecision
) {
  const enforcement = decision.enforcement_action;

  if (enforcement?.type !== "suspend" || !AGE_SUSPENSION_REASON_CODES.has(enforcement.reasonCode)) {
    return;
  }

  try {
    const result = await app.db.query<{ email: string | null }>(
      "select email from app_users where id = $1 limit 1",
      [userId]
    );
    const email = result.rows[0]?.email ?? null;

    if (email) {
      await sendAgeSuspensionAppealEmail({
        appealUrl: `${app.config.APP_URL.replace(/\/$/, "")}/support?appeal=1`,
        config: app.config,
        email,
        logger: app.log
      });
    }

    await sendAgeSuspensionInboxEmail({
      config: app.config,
      logger: app.log,
      userEmail: email,
      userId
    });
  } catch (error) {
    app.log.error({ err: error, userId }, "age suspension appeal email failed");
  }
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

function allowedReviewMetadata(providerResult: ProviderModerationResult, decision: PolicyDecision) {
  const harassmentOnly = decision.decision === "allow" &&
    providerResult.labels.length > 0 &&
    providerResult.labels.every((label) => label.normalized_label === "harassment");

  return {
    moderationStatus: harassmentOnly ? "flagged" as const : "allowed" as const,
    flaggedReason: harassmentOnly ? "harassment_review_only" : null
  };
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
    persistAllowedReview?: boolean;
  } = {}
) {
  await syncModerationSystemErrors(app, {
    surface,
    contentType,
    contentId: options.contentId,
    providerResult
  });

  if (decision.decision === "allow") {
    const reviewMetadata = allowedReviewMetadata(providerResult, decision);

    if (reviewMetadata.moderationStatus === "flagged" && options.persistAllowedReview !== false) {
      await recordContentReview(app, {
        userId,
        surface,
        contentType,
        status: "allowed",
        moderationStatus: reviewMetadata.moderationStatus,
        flaggedReason: reviewMetadata.flaggedReason,
        contentId: options.contentId,
        contentRef: options.contentRef,
        providerResult,
        decision
      });
    }

    return {
      decision,
      providerResult,
      ...reviewMetadata
    };
  }

  if (decision.decision === "quarantine") {
    // Provider outages are infrastructure failures, not human moderation decisions. Do
    // not put one queue row per failed request in front of moderators; photo routes
    // retain the encrypted pending asset and retry it when provider health returns.
    if (isProviderUnavailableDecision(decision)) {
      app.log?.error?.({
        provider: providerResult.provider,
        providerRequestId: providerResult.provider_request_id,
        surface,
        contentType,
        contentId: options.contentId ?? null,
        error: providerResult.error ?? null
      }, "moderation provider unavailable; content was not published");

      const message = userMessageForDecision(decision, contentType);
      throw contentType === "image"
        ? new ModerationUnavailableError(message, providerResult)
        : new ApiError(503, "MODERATION_UNAVAILABLE", message);
    }

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

    throw new ApiError(503, "MODERATION_UNAVAILABLE", userMessageForDecision(decision, contentType));
  }

  const contentReviewId = await recordContentReview(app, {
    userId,
    surface,
    contentType,
    status: "rejected",
    contentId: options.contentId,
    contentRef: options.contentRef,
    providerResult,
    decision,
    ...(decision.user_message_code === "minor_face_review_suspension"
      ? { moderationStatus: "pending_review" as const }
      : {})
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

  await notifyAgeSuspensionAppeal(app, userId, decision);

  throw new ModerationRejectedError({
    contentReviewId,
    decision,
    message: userMessageForDecision(decision, contentType),
    providerResult,
    statusCode: decision.enforcement_action?.type === "suspend" ? 403 : 400
  });
}

export async function moderateTextWithLocalFallback(
  app: FastifyInstance,
  input: ModerateTextInput,
  unavailableProviderResult: ProviderModerationResult
) {
  const fallbackResult = await new MockModerationProvider().moderateText({
    ...input,
    text: prepareTextForModerationProvider(input.text)
  });

  const providerResult: ProviderModerationResult = {
    ...fallbackResult,
    provider: "local_text_fallback",
    provider_request_id: `local-text-fallback-${randomUUID()}`,
    raw_result: {
      ...(fallbackResult.raw_result ?? {}),
      fallback: {
        reason: "stream_text_moderation_unavailable",
        provider: unavailableProviderResult.provider,
        providerRequestId: unavailableProviderResult.provider_request_id,
        status: unavailableProviderResult.status ?? null,
        error: unavailableProviderResult.error ?? null
      }
    }
  };

  app.log?.warn({
    fallbackSurface: input.surface,
    surface: input.surface,
    provider: unavailableProviderResult.provider,
    providerRequestId: unavailableProviderResult.provider_request_id,
    providerStatus: unavailableProviderResult.status,
    providerError: unavailableProviderResult.error
  }, "Stream text moderation unavailable; used local text fallback");

  return providerResult;
}

export const moderateFeedTextWithLocalFallback = moderateTextWithLocalFallback;

export async function moderateTextOrReject(
  app: FastifyInstance,
  input: ModerateTextInput
): Promise<TextModerationResult> {
  const providerResultFromPrimary: ProviderModerationResult = containsBlockedRacialSlur(input.text)
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
    : await createModerationProviderOrUnavailable(app.config).moderateText({
        ...input,
        text: prepareTextForModerationProvider(input.text)
      });
  // Text is either screened synchronously or not saved. The local policy fallback is
  // deliberately available on every text surface, including DMs and group chats, so a
  // Stream outage cannot turn a text message into a pending-review item or an outage error.
  const providerResult = providerResultUnavailable(providerResultFromPrimary)
    ? await moderateTextWithLocalFallback(app, input, providerResultFromPrimary)
    : providerResultFromPrimary;
  const decision = mapProviderResultToPolicy({
    surface: input.surface,
    contentType: "text",
    providerResult
  });

  return handlePolicyDecision(app, input.userId, input.surface, "text", providerResult, decision, {
    contentId: input.contentId,
    contentRef: input.contentRef,
    persistAllowedReview: input.persistAllowedReview
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
    } as ProviderModerationResult,
    moderationStatus: "allowed" as const,
    flaggedReason: null
  };
}

export async function moderateImageOrReject(
  app: FastifyInstance,
  input: ModerateImageInput,
  options: { allowProfilePhotoManualReview?: boolean } = {}
) {
  const provider = createModerationProviderOrUnavailable(app.config);
  const useProfilePhotoRekognitionFallback = canUseProfilePhotoRekognitionFallback(app, input.surface);
  const useMessagePhotoRekognitionFallback = canUseMessagePhotoRekognitionFallback(app, input.surface);
  const useFeedImageRekognitionFallback = canUseFeedImageRekognitionFallback(app, input.surface);
  const usePhotoRekognitionFallback = useProfilePhotoRekognitionFallback ||
    useMessagePhotoRekognitionFallback ||
    useFeedImageRekognitionFallback;
  const startedAt = Date.now();
  let providerResult: ProviderModerationResult;

  try {
    providerResult = await provider.moderateImage(input);
  } catch (error) {
    // Always convert a thrown provider call into an error result rather than rethrowing.
    // Rethrowing surfaced a bare 500; carrying on lets the Rekognition fallback below
    // still score the image, and if that fails too the upload is refused with a message
    // that actually tells the user what happened.
    app.log?.error?.(
      { err: error, provider: provider.name, surface: input.surface },
      "image moderation provider failed"
    );
    providerResult = providerErrorResult(provider.name, startedAt, error);
  }

  if (app.config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true || usePhotoRekognitionFallback) {
    const streamUnusable = providerResultUnavailable(providerResult) || providerResult.provider === "mock";
    const safetyResult = input.surface === "profile_photo"
      ? await detectProfilePhotoHuman(app.config, input.bytes)
      : useMessagePhotoRekognitionFallback
        ? await detectPublicImageSafety(app.config, input.bytes)
      : useFeedImageRekognitionFallback && streamUnusable
        ? await detectPublicImageSafety(app.config, input.bytes)
        : await detectImageChildFaces(app.config, input.bytes);

    providerResult = usePhotoRekognitionFallback &&
      streamUnusable &&
      providerResultComplete(safetyResult)
      ? photoRekognitionFallbackResult(providerResult, safetyResult)
      : mergeProfilePhotoSafetyResults(providerResult, safetyResult);
  }

  // Stream can legitimately return an asynchronous image result. Do not turn that normal
  // state into a provider-unavailable review row; the image has not been persisted, so the
  // safe outcome is a retryable 503 until a complete provider or fallback result exists.
  if (providerResult.status?.toLowerCase() === "partial") {
    app.log?.warn?.({ surface: input.surface, userId: input.userId }, "image moderation is still pending");
    throw new ModerationUnavailableError(
      userMessageForDecision({
        decision: "quarantine",
        category: "provider_unavailable",
        severity: "medium",
        confidence: 1,
        create_evidence_event: false,
        evidence_value: 0,
        trust_impact: 0,
        penalty_decays: true,
        moderation_history_required: true,
        reason_code: "moderation_pending",
        user_message_code: "moderation_delayed"
      }, "image"),
      providerResult
    );
  }

  let decision = mapProviderResultToPolicy({
    surface: input.surface,
    contentType: "image",
    providerResult
  });
  const resolvedProviderResult = providerResult;

  // Every provider is unreachable, including the Rekognition fallback, so the image was
  // never actually screened. Refuse it rather than publishing something no scanner has
  // looked at. `handlePolicyDecision` turns this into a 503 whose message tells the user
  // to try again or contact reports@cruush.app.
  if (isProviderUnavailableDecision(decision)) {
    app.log?.error?.(
      {
        provider: providerResult.provider,
        surface: input.surface,
        userId: input.userId,
        providerError: providerResult.error ?? null
      },
      "photo moderation unavailable, refusing upload"
    );
  }

  let gatedProviderResult = resolvedProviderResult;

  if (input.surface === "profile_photo") {
    const gate = resolveProfilePhotoAdultHumanGate(gatedProviderResult, decision, {
      allowManualReview: options.allowProfilePhotoManualReview === true
    });

    if (gate.status === "manual_review_required") {
      return gate;
    }

    decision = gate.decision;
    gatedProviderResult = gate.providerResult;
  }

  return handlePolicyDecision(app, input.userId, input.surface, "image", gatedProviderResult, decision, {
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
      } as ProviderModerationResult,
      moderationStatus: "allowed" as const,
      flaggedReason: null
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
      : input.contentType === "post" || input.contentType === "place" || input.contentType === "place_message"
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
      placeId: input.placeId ?? null,
      placeMessageId: input.placeMessageId ?? null,
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
      category: "user_report",
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
