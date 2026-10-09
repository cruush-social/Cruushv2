import type { FastifyInstance } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  getBugReportForTriage,
  linkBugReportTriage,
  listBugReportsForTriage
} from "../bug-report-triage.js";
import {
  buildCsamReportPacket,
  getCsamIncidentDetails,
  markCsamIncidentSubmitted
} from "../csam-reporting.js";
import { ApiError } from "../errors.js";
import { decryptMediaBytes } from "../media-encryption.js";
import { readEncryptedMediaObject } from "../media-storage.js";
import {
  approvePendingProfilePhotoReview,
  getPendingProfilePhotoReviewImage,
  listPendingProfilePhotoReviews,
  rejectPendingProfilePhotoReview
} from "../profile-photo-manual-reviews.js";

const internalUserParamsSchema = z.object({
  userId: z.uuid()
}).strict();

const internalCsamIncidentParamsSchema = z.object({
  incidentId: z.uuid()
}).strict();

const markCsamIncidentSubmittedPayloadSchema = z.object({
  cyberTiplineReportId: z.string().trim().min(1).max(128),
  submittedBy: z.string().trim().max(320).optional(),
  notes: z.string().trim().max(4000).optional()
}).strict();

const internalProfilePhotoReviewParamsSchema = z.object({
  reviewId: z.uuid()
}).strict();

const internalProfilePhotoReviewListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25)
}).strict();

const internalProfilePhotoReviewDecisionSchema = z.object({
  reviewerReference: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500).optional()
}).strict();

const internalProfilePhotoReviewRejectionSchema = internalProfilePhotoReviewDecisionSchema.extend({
  reason: z.string().trim().min(1).max(500)
}).strict();

const internalBugReportParamsSchema = z.object({
  reportId: z.uuid()
}).strict();

const internalBugReportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  status: z.enum(["open", "in_progress", "closed", "dismissed"]).optional(),
  aiTriageStatus: z.enum(["pending", "processing", "complete", "failed"]).optional()
}).strict();

const internalBugReportLinkSchema = z.object({
  branch: z.string().trim().regex(/^bugfix\/[A-Za-z0-9._\-/]{1,80}$/).optional(),
  prUrl: z.url().refine(
    (value) => {
      try {
        return new URL(value).origin === "https://github.com";
      } catch {
        return false;
      }
    },
    { message: "prUrl must be a github.com URL." }
  ).optional(),
  status: z.enum(["open", "in_progress", "closed", "dismissed"]).optional()
}).strict().refine(
  (value) => Boolean(value.branch || value.prUrl || value.status),
  { message: "Provide at least one of branch, prUrl, or status." }
);

function assertInternalAccess(app: FastifyInstance, headerValue: string | string[] | undefined) {
  const configuredSecret = app.config.INTERNAL_API_SECRET ?? "";
  const providedSecret = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const configuredDigest = createHash("sha256").update(configuredSecret).digest();
  const providedDigest = createHash("sha256").update(providedSecret ?? "").digest();

  if (!configuredSecret || !timingSafeEqual(configuredDigest, providedDigest)) {
    throw new ApiError(403, "FORBIDDEN", "Internal moderation access is disabled.");
  }
}

function assertBankProfilePhotoReviewAccess(
  app: FastifyInstance,
  headerValue: string | string[] | undefined
) {
  assertInternalAccess(app, headerValue);

  if (
    app.config.APP_DEPLOYMENT_STAGE !== "staging" ||
    app.config.BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED !== true ||
    app.config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true
  ) {
    throw new ApiError(403, "FORBIDDEN", "Bank profile-photo review is disabled.");
  }
}

export async function registerInternalRoutes(app: FastifyInstance) {
  app.get("/api/internal/profile-photo-reviews", async (request, reply) => {
    assertBankProfilePhotoReviewAccess(app, request.headers["x-internal-secret"]);
    await app.rateLimiter.assert({
      key: `internal-profile-photo-reviews:list:${request.ip}`,
      max: 60,
      windowMs: 60_000,
      message: "Too many internal profile-photo review requests."
    });
    const { limit } = internalProfilePhotoReviewListQuerySchema.parse(request.query);
    const reviews = await listPendingProfilePhotoReviews(app.db, app.config, limit);

    return reply.send({ data: reviews });
  });

  app.get("/api/internal/profile-photo-reviews/:reviewId/image", async (request, reply) => {
    assertBankProfilePhotoReviewAccess(app, request.headers["x-internal-secret"]);
    await app.rateLimiter.assert({
      key: `internal-profile-photo-reviews:image:${request.ip}`,
      max: 60,
      windowMs: 60_000,
      message: "Too many internal profile-photo image requests."
    });
    const { reviewId } = internalProfilePhotoReviewParamsSchema.parse(request.params);
    const review = await getPendingProfilePhotoReviewImage(app.db, reviewId);

    if (!review) {
      throw new ApiError(404, "NOT_FOUND", "Profile-photo review not found.");
    }

    const ciphertext = await readEncryptedMediaObject(app.config, review.object_key);
    const plaintext = decryptMediaBytes(app.config, {
      ciphertext,
      nonce: review.content_nonce,
      authTag: review.content_auth_tag,
      encryptedDataKey: review.encrypted_data_key,
      dataKeyNonce: review.data_key_nonce,
      dataKeyAuthTag: review.data_key_auth_tag,
      keyVersion: review.key_version
    });

    return reply
      .type(review.mime_type)
      .header("cache-control", "private, no-store, max-age=0")
      .header("pragma", "no-cache")
      .header("x-robots-tag", "noindex, nofollow, noarchive")
      .header("referrer-policy", "no-referrer")
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(plaintext);
  });

  app.post("/api/internal/profile-photo-reviews/:reviewId/approve", async (request, reply) => {
    assertBankProfilePhotoReviewAccess(app, request.headers["x-internal-secret"]);
    await app.rateLimiter.assert({
      key: `internal-profile-photo-reviews:decision:${request.ip}`,
      max: 30,
      windowMs: 60_000,
      message: "Too many internal profile-photo decisions."
    });
    const { reviewId } = internalProfilePhotoReviewParamsSchema.parse(request.params);
    const payload = internalProfilePhotoReviewDecisionSchema.parse(request.body);
    const result = await approvePendingProfilePhotoReview(app.db, reviewId, payload);

    return reply.send({ data: result });
  });

  app.post("/api/internal/profile-photo-reviews/:reviewId/reject", async (request, reply) => {
    assertBankProfilePhotoReviewAccess(app, request.headers["x-internal-secret"]);
    await app.rateLimiter.assert({
      key: `internal-profile-photo-reviews:decision:${request.ip}`,
      max: 30,
      windowMs: 60_000,
      message: "Too many internal profile-photo decisions."
    });
    const { reviewId } = internalProfilePhotoReviewParamsSchema.parse(request.params);
    const payload = internalProfilePhotoReviewRejectionSchema.parse(request.body);
    const result = await rejectPendingProfilePhotoReview(app.db, app.config, reviewId, payload);

    return reply.send({ data: result });
  });

  app.get("/api/internal/bug-reports", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    await app.rateLimiter.assert({
      key: `internal-bug-reports:list:${request.ip}`,
      max: 60,
      windowMs: 60_000,
      message: "Too many internal bug report requests."
    });
    const filters = internalBugReportListQuerySchema.parse(request.query);
    const reports = await listBugReportsForTriage(app.db, filters);

    return reply.send({ data: reports });
  });

  app.get("/api/internal/bug-reports/:reportId", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    await app.rateLimiter.assert({
      key: `internal-bug-reports:read:${request.ip}`,
      max: 120,
      windowMs: 60_000,
      message: "Too many internal bug report requests."
    });
    const { reportId } = internalBugReportParamsSchema.parse(request.params);
    const report = await getBugReportForTriage(app.db, reportId);

    if (!report) {
      throw new ApiError(404, "NOT_FOUND", "Bug report not found.");
    }

    return reply.send({ data: report });
  });

  app.post("/api/internal/bug-reports/:reportId/link", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    await app.rateLimiter.assert({
      key: `internal-bug-reports:link:${request.ip}`,
      max: 60,
      windowMs: 60_000,
      message: "Too many internal bug report updates."
    });
    const { reportId } = internalBugReportParamsSchema.parse(request.params);
    const payload = internalBugReportLinkSchema.parse(request.body);
    const report = await linkBugReportTriage(app.db, reportId, payload);

    if (!report) {
      throw new ApiError(404, "NOT_FOUND", "Bug report not found.");
    }

    return reply.send({ data: report });
  });

  app.get("/api/internal/csam-incidents/:incidentId", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    const { incidentId } = internalCsamIncidentParamsSchema.parse(request.params);
    const details = await getCsamIncidentDetails(app, incidentId);

    return reply.send({
      data: details
    });
  });

  app.get("/api/internal/csam-incidents/:incidentId/report-packet", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    const { incidentId } = internalCsamIncidentParamsSchema.parse(request.params);
    const packet = await buildCsamReportPacket(app, incidentId);

    return reply.send({
      data: packet
    });
  });

  app.post("/api/internal/csam-incidents/:incidentId/mark-submitted", async (request, reply) => {
    assertInternalAccess(app, request.headers["x-internal-secret"]);
    const { incidentId } = internalCsamIncidentParamsSchema.parse(request.params);
    const payload = markCsamIncidentSubmittedPayloadSchema.parse(request.body);
    const result = await markCsamIncidentSubmitted(app, {
      incidentId,
      cyberTiplineReportId: payload.cyberTiplineReportId,
      submittedBy: payload.submittedBy,
      notes: payload.notes
    });

    return reply.send({
      data: result
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
