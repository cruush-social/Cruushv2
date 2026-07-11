import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";
import { createModerationProvider } from "./moderation-provider.js";
import type {
  ModerationContentType,
  ModerationSurface,
  PolicyDecision,
  ProviderModerationResult
} from "./moderation-types.js";
import { mapProviderResultToPolicy } from "./policy-mapper.js";
import { applyPolicyDecision } from "./trust-engine.js";

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
};

type ModerateProfileInput = {
  userId: string;
  fields: Record<string, string | string[] | null | undefined>;
  contentId?: string;
};

type UserReportInput = {
  reporterId: string;
  targetUserId: string | null;
  contentType: "user" | "profile" | "conversation" | "message" | "post";
  contentId: string;
  reason: string;
  details?: string;
  conversationId?: string | null;
  messageId?: string | null;
  postId?: string | null;
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
}) {
  const name = options.name ?? "moderation_review";
  const providerSql = options.providerParam ?? "'mock'";
  const providerRequestIdSql = options.providerRequestIdParam ?? "'mock-synchronous-allow'";
  const labelsSql = options.normalizedLabelsParam ? `${options.normalizedLabelsParam}::jsonb` : "'[]'::jsonb";
  const policyDecisionSql = options.policyDecisionParam ? `${options.policyDecisionParam}::jsonb` : `'{"decision":"allow","reason_code":"content_allowed"}'::jsonb`;
  const moderationStatusSql = options.moderationStatusParam ?? "'allowed'";
  const flaggedReasonSql = options.flaggedReasonParam ?? "null";
  const moderationRawResultSql = options.moderationRawResultParam ? `${options.moderationRawResultParam}::jsonb` : "'{}'::jsonb";
  const sourceSql = options.fromCte
    ? `select
      ${options.userIdParam},
      '${surfaceSqlLiteral[options.surface]}',
      '${contentTypeSqlLiteral[options.contentType]}',
      'allowed',
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

async function recordContentReview(app: FastifyInstance, input: ContentReviewInput) {
  const id = randomUUID();
  const moderationStatus = input.moderationStatus ?? moderationStatusForReview(input.status, input.decision);
  const flaggedReason = input.flaggedReason ?? (
    input.decision.reason_code === "content_allowed" ? null : input.decision.reason_code
  );

  await app.db.query(
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
  if (decision.user_message_code === "profile_photo_not_adult_human") {
    return "Profile photo must show an adult human body.";
  }

  if (decision.user_message_code === "content_pending_review") {
    return "This content could not be saved because automated moderation could not approve it.";
  }

  if (decision.user_message_code === "moderation_delayed") {
    return "Automated moderation is temporarily unavailable. Try again later.";
  }

  if (decision.user_message_code === "feed_content_rejected") {
    return "This feed post could not be published because it violates Cruush safety rules.";
  }

  if (decision.user_message_code === "content_rejected_zero_tolerance") {
    return "This content violates Cruush safety rules and cannot be saved.";
  }

  return "This content violates Cruush safety rules and cannot be saved.";
}

function hasAdultHumanBodyProof(providerResult: ProviderModerationResult) {
  return providerResult.labels.some((label) =>
    label.normalized_label === "adult_human_body" &&
    label.confidence >= 0.7
  );
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

  throw new ApiError(
    decision.enforcement_action?.type === "suspend" ? 403 : 400,
    "CONTENT_REJECTED",
    userMessageForDecision(decision)
  );
}

export async function moderateTextOrReject(app: FastifyInstance, input: ModerateTextInput) {
  const provider = createModerationProvider(app.config);
  const providerResult = await provider.moderateText(input);
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

export async function moderateImageOrReject(app: FastifyInstance, input: ModerateImageInput) {
  const provider = createModerationProvider(app.config);
  const providerResult = await provider.moderateImage(input);
  let decision = mapProviderResultToPolicy({
    surface: input.surface,
    contentType: "image",
    providerResult
  });
  let resolvedProviderResult = providerResult;

  if (
    input.surface === "profile_photo" &&
    decision.decision === "allow" &&
    !hasAdultHumanBodyProof(providerResult)
  ) {
    const rejection = rejectProfilePhotoWithoutAdultHuman(providerResult);
    decision = rejection.decision;
    resolvedProviderResult = rejection.providerResult;
  }

  return handlePolicyDecision(app, input.userId, input.surface, "image", resolvedProviderResult, decision, {
    contentId: input.contentId,
    contentRef: input.contentRef
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

export async function createUserReport(app: FastifyInstance, input: UserReportInput) {
  const reviewUserId = input.targetUserId ?? input.reporterId;
  const reviewId = await recordContentReview(app, {
    userId: reviewUserId,
    surface: input.contentType === "post"
      ? "feed"
      : input.contentType === "profile" || input.contentType === "user"
        ? "profile"
        : "direct_message",
    contentType: "text",
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
  });

  return reviewId;
}
