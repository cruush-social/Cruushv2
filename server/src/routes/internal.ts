import { unlink } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { getProfilePhotoStorageDir, PROFILE_PHOTO_MEDIA_PREFIX } from "../media-storage.js";

const internalUserParamsSchema = z.object({
  userId: z.uuid()
}).strict();

const moderationReviewParamsSchema = z.object({
  reviewId: z.uuid()
}).strict();

const moderationQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
}).strict();

const moderationReviewActionSchema = z.object({
  action: z.enum(["approve", "remove", "block", "mark_reviewed"]),
  reviewerUserId: z.uuid()
}).strict();

type ContentReviewQueueRow = {
  id: string;
  user_id: string;
  surface: string;
  content_type: string;
  status: string;
  moderation_status: string;
  flagged_reason: string | null;
  provider: string | null;
  moderation_provider: string | null;
  provider_request_id: string | null;
  content_id: string | null;
  content_ref: Record<string, unknown> | null;
  created_at: string | Date;
  completed_at: string | Date | null;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
};

function assertInternalAccess(app: FastifyInstance, headerValue: string | string[] | undefined) {
  const configuredSecret = app.config.INTERNAL_API_SECRET ?? "";
  const providedSecret = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!configuredSecret || providedSecret !== configuredSecret) {
    throw new ApiError(403, "FORBIDDEN", "Internal moderation access is disabled.");
  }
}

function normalizeContentRef(contentRef: ContentReviewQueueRow["content_ref"]) {
  if (!contentRef || typeof contentRef !== "object") {
    return {};
  }

  return contentRef;
}

function assertNotSelfReview(row: ContentReviewQueueRow, reviewerUserId: string) {
  const contentRef = normalizeContentRef(row.content_ref);
  const blockedIds = new Set([
    row.user_id,
    typeof contentRef.reporterId === "string" ? contentRef.reporterId : null,
    typeof contentRef.targetUserId === "string" ? contentRef.targetUserId : null
  ].filter((value): value is string => Boolean(value)));

  if (blockedIds.has(reviewerUserId)) {
    throw new ApiError(403, "FORBIDDEN", "Moderators cannot review their own reported or authored content.");
  }
}

function actionToModerationStatus(action: z.infer<typeof moderationReviewActionSchema>["action"]) {
  if (action === "approve") {
    return "allowed";
  }

  if (action === "remove") {
    return "removed";
  }

  if (action === "block") {
    return "blocked";
  }

  return "flagged";
}

async function attachApprovedProfilePhoto(app: FastifyInstance, row: ContentReviewQueueRow) {
  if (row.surface !== "profile_photo") {
    return;
  }

  const contentRef = normalizeContentRef(row.content_ref);
  const url = typeof contentRef.url === "string" ? contentRef.url : null;

  if (!url) {
    return;
  }

  await app.db.query(
    `update profiles
     set photos = case
       when array_position(photos, $2) is not null then photos
       when coalesce(array_length(photos, 1), 0) < 9 then array_append(photos, $2)
       else photos
     end,
     updated_at = now()
     where id = $1`,
    [row.user_id, url]
  );
}

async function removePendingProfilePhoto(app: FastifyInstance, row: ContentReviewQueueRow) {
  if (row.surface !== "profile_photo") {
    return;
  }

  const contentRef = normalizeContentRef(row.content_ref);
  const url = typeof contentRef.url === "string" ? contentRef.url : null;
  const prefix = `${PROFILE_PHOTO_MEDIA_PREFIX}/`;

  if (!url?.startsWith(prefix)) {
    return;
  }

  const filename = url.slice(prefix.length);

  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    !filename.startsWith(`${row.user_id}-`) ||
    !/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)
  ) {
    return;
  }

  try {
    await unlink(path.join(getProfilePhotoStorageDir(app.config), filename));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

export async function registerInternalRoutes(app: FastifyInstance) {
  app.get("/api/internal/moderation/queue", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    const query = moderationQueueQuerySchema.parse(request.query);
    const result = await app.db.query<ContentReviewQueueRow>(
      `select
         id::text as id,
         user_id::text as user_id,
         surface,
         content_type,
         status,
         moderation_status,
         flagged_reason,
         provider,
         moderation_provider,
         provider_request_id,
         content_id,
         content_ref,
         created_at,
         completed_at,
         reviewed_by::text as reviewed_by,
         reviewed_at
       from content_reviews
       where moderation_status in ('pending_review', 'flagged')
         and reviewed_at is null
       order by created_at desc
       limit $1`,
      [query.limit]
    );

    return reply.send({
      data: result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        surface: row.surface,
        contentType: row.content_type,
        contentId: row.content_id,
        contentRef: normalizeContentRef(row.content_ref),
        provider: row.moderation_provider ?? row.provider,
        providerRequestId: row.provider_request_id,
        reason: row.flagged_reason,
        status: row.status,
        moderationStatus: row.moderation_status,
        createdAt: new Date(row.created_at).toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null
      }))
    });
  });

  app.post("/api/internal/moderation/reviews/:reviewId/actions", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    const { reviewId } = moderationReviewParamsSchema.parse(request.params);
    const payload = moderationReviewActionSchema.parse(request.body);
    const reviewResult = await app.db.query<ContentReviewQueueRow>(
      `select
         id::text as id,
         user_id::text as user_id,
         surface,
         content_type,
         status,
         moderation_status,
         flagged_reason,
         provider,
         moderation_provider,
         provider_request_id,
         content_id,
         content_ref,
         created_at,
         completed_at,
         reviewed_by::text as reviewed_by,
         reviewed_at
       from content_reviews
       where id = $1
       limit 1`,
      [reviewId]
    );
    const review = reviewResult.rows[0];

    if (!review) {
      throw new ApiError(404, "NOT_FOUND", "Moderation review not found.");
    }

    assertNotSelfReview(review, payload.reviewerUserId);

    if (payload.action === "approve") {
      await attachApprovedProfilePhoto(app, review);
    }

    if (payload.action === "remove" || payload.action === "block") {
      await removePendingProfilePhoto(app, review);
    }

    const moderationStatus = actionToModerationStatus(payload.action);
    const updatedResult = await app.db.query<ContentReviewQueueRow>(
      `update content_reviews
       set moderation_status = $2,
           status = 'closed',
           reviewed_by = $3,
           reviewed_at = now(),
           completed_at = coalesce(completed_at, now())
       where id = $1
       returning
         id::text as id,
         user_id::text as user_id,
         surface,
         content_type,
         status,
         moderation_status,
         flagged_reason,
         provider,
         moderation_provider,
         provider_request_id,
         content_id,
         content_ref,
         created_at,
         completed_at,
         reviewed_by::text as reviewed_by,
         reviewed_at`,
      [reviewId, moderationStatus, payload.reviewerUserId]
    );
    const updated = updatedResult.rows[0];

    return reply.send({
      data: {
        id: updated.id,
        moderationStatus: updated.moderation_status,
        status: updated.status,
        reviewedBy: updated.reviewed_by,
        reviewedAt: updated.reviewed_at ? new Date(updated.reviewed_at).toISOString() : null
      }
    });
  });

  app.get("/api/internal/users/:userId/trust", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    const { userId } = internalUserParamsSchema.parse(request.params);

    const [
      trustProfile,
      trustEvents,
      evidenceEvents,
      moderationHistory,
      featureRestrictions,
      suspensions
    ] = await Promise.all([
      app.db.query(
        `select
           user_id::text as user_id,
           trust_score,
           trust_level,
           report_weight,
           max_future_trust,
           is_suspended,
           created_at,
           updated_at
         from user_trust_profiles
         where user_id = $1`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           event_type,
           value,
           decays,
           permanent,
           source,
           metadata,
           created_at
         from trust_events
         where user_id = $1
         order by created_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           source_type,
           category,
           evidence_value,
           confidence,
           expires_at,
           metadata,
           created_at
         from evidence_events
         where target_user_id = $1
         order by created_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           content_review_id::text as content_review_id,
           category,
           action,
           trust_impact,
           trust_cap_applied,
           source,
           reason_code,
           created_at
         from moderation_history
         where user_id = $1
         order by created_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           feature,
           scope,
           reason_code,
           starts_at,
           ends_at,
           created_at
         from feature_restrictions
         where user_id = $1
         order by starts_at desc
         limit 100`,
        [userId]
      ),
      app.db.query(
        `select
           id::text as id,
           reason_code,
           starts_at,
           ends_at,
           permanent,
           created_at
         from suspensions
         where user_id = $1
         order by starts_at desc
         limit 100`,
        [userId]
      )
    ]);

    return reply.send({
      data: {
        trustProfile: trustProfile.rows[0] ?? null,
        trustEvents: trustEvents.rows,
        evidenceEvents: evidenceEvents.rows,
        moderationHistory: moderationHistory.rows,
        featureRestrictions: featureRestrictions.rows,
        suspensions: suspensions.rows
      }
    });
  });
}
