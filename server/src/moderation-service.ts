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
};

type ModerateImageInput = {
  userId: string;
  surface: ModerationSurface;
  mimeType: string;
  filename?: string;
  bytes: Buffer;
};

type ContentReviewInput = {
  userId: string;
  surface: ModerationSurface;
  contentType: ModerationContentType;
  status: "allowed" | "rejected" | "queued" | "failed_provider_unavailable";
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
}) {
  const name = options.name ?? "moderation_review";
  const sourceSql = options.fromCte
    ? `select
      ${options.userIdParam},
      '${surfaceSqlLiteral[options.surface]}',
      '${contentTypeSqlLiteral[options.contentType]}',
      'allowed',
      'mock',
      'mock-synchronous-allow',
      '[]'::jsonb,
      '{"decision":"allow","reason_code":"content_allowed"}'::jsonb,
      now()
    from ${options.fromCte}`
    : `values (
      ${options.userIdParam},
      '${surfaceSqlLiteral[options.surface]}',
      '${contentTypeSqlLiteral[options.contentType]}',
      'allowed',
      'mock',
      'mock-synchronous-allow',
      '[]'::jsonb,
      '{"decision":"allow","reason_code":"content_allowed"}'::jsonb,
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
      completed_at
    )
    ${sourceSql}
    returning id
  )`;
}

async function recordContentReview(app: FastifyInstance, input: ContentReviewInput) {
  const id = randomUUID();

  await app.db.query(
    `insert into content_reviews (
       id,
       user_id,
       surface,
       content_type,
       status,
       provider,
       provider_request_id,
       normalized_labels,
       policy_decision,
       completed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, now())`,
    [
      id,
      input.userId,
      input.surface,
      input.contentType,
      input.status,
      input.providerResult.provider,
      input.providerResult.provider_request_id,
      JSON.stringify(input.providerResult.labels),
      JSON.stringify(input.decision)
    ]
  );

  return id;
}

function userMessageForDecision(decision: PolicyDecision) {
  if (decision.user_message_code === "moderation_delayed") {
    return "Content moderation is temporarily delayed. Try again later.";
  }

  if (decision.user_message_code === "feed_content_rejected") {
    return "This feed post could not be published because it violates Cruush safety rules.";
  }

  if (decision.user_message_code === "content_rejected_zero_tolerance") {
    return "This content violates Cruush safety rules and cannot be saved.";
  }

  return "This content violates Cruush safety rules and cannot be saved.";
}

async function handlePolicyDecision(
  app: FastifyInstance,
  userId: string,
  surface: ModerationSurface,
  contentType: ModerationContentType,
  providerResult: ProviderModerationResult,
  decision: PolicyDecision
) {
  if (decision.decision === "allow") {
    return decision;
  }

  if (decision.decision === "quarantine") {
    await recordContentReview(app, {
      userId,
      surface,
      contentType,
      status: "queued",
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

  return handlePolicyDecision(app, input.userId, input.surface, "text", providerResult, decision);
}

export async function moderateImageOrReject(app: FastifyInstance, input: ModerateImageInput) {
  const provider = createModerationProvider(app.config);
  const providerResult = await provider.moderateImage(input);
  const decision = mapProviderResultToPolicy({
    surface: input.surface,
    contentType: "image",
    providerResult
  });

  return handlePolicyDecision(app, input.userId, input.surface, "image", providerResult, decision);
}
