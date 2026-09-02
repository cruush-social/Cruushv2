import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";
import {
  createPendingMediaAsset,
  deletePendingMediaAsset,
  isModerationEvidenceRetained,
  isPhotoModerationUnavailable,
  moderatePendingMediaAsset
} from "./media-assets.js";
import { MAX_IMAGE_BYTES, processUploadedImage } from "./media-image.js";
import { approvedContentReviewCte } from "./moderation-service.js";
import { toReportablePhotoUploadError } from "./photo-upload-incident.js";
import { photoUploadAvailability } from "./photo-upload-availability.js";
import { getCruushEntitlement } from "./match-relationships.js";

function uploadError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("request file too large") || message.includes("file size")) {
    return new ApiError(400, "VALIDATION_ERROR", "Feed photo must be 5 MB or smaller.");
  }
  return error;
}

export async function handleFeedPhotoUpload(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string
) {
  const entitlement = await getCruushEntitlement(app, userId);
  if (!entitlement.cruushPlus) {
    throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", "Photo posts are part of cruush+.");
  }
  if (!photoUploadAvailability(app.config).messagePhotos) {
    throw new ApiError(503, "FEATURE_RESTRICTED", "Feed photo uploads are temporarily unavailable.");
  }

  await app.rateLimiter.assert({
    key: `feed-photo-upload:${userId}`,
    max: 12,
    windowMs: 60 * 1000,
    message: "Too many Feed photo uploads. Try again later."
  });

  const eligible = (await app.db.query<{ allowed: boolean }>(
    `select exists (
       select 1
       from app_users app_user
       left join user_trust_profiles trust on trust.user_id = app_user.id
       where app_user.id = $1
         and (
           $2::boolean
           or (
             app_user.account_status = 'active'
             and coalesce(trust.is_suspended, false) = false
             and coalesce(trust.trust_score, 50) > 20
             and not exists (
               select 1 from suspensions suspension
               where suspension.user_id = app_user.id
                 and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
             )
             and not exists (
               select 1 from feature_restrictions restriction
               where restriction.user_id = app_user.id
                 and restriction.feature in ('photo_uploads', 'feed_posting')
                 and (restriction.ends_at is null or restriction.ends_at > now())
             )
           )
         )
     ) as allowed`,
    [userId, entitlement.ownerFullAccess === true]
  )).rows[0]?.allowed;

  if (!eligible) {
    throw new ApiError(403, "FEATURE_RESTRICTED", "Feed photo uploads are unavailable for this account.");
  }

  let upload;
  try {
    upload = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
  } catch (error) {
    throw uploadError(error);
  }

  if (!upload || upload.fieldname !== "photo") {
    throw new ApiError(400, "VALIDATION_ERROR", "Upload a Feed photo in the photo field.");
  }

  let bytes: Buffer;
  try {
    bytes = await upload.toBuffer();
  } catch (error) {
    throw uploadError(error);
  }
  if (upload.file.truncated) {
    throw new ApiError(400, "VALIDATION_ERROR", "Feed photo must be 5 MB or smaller.");
  }

  const processed = await processUploadedImage(bytes, upload.mimetype);
  let pendingAsset: Awaited<ReturnType<typeof createPendingMediaAsset>> | null = null;

  try {
    pendingAsset = await createPendingMediaAsset(app, request, {
      ownerUserId: userId,
      surface: "feed_photo",
      processed,
      moderationHold: { kind: "feed_photo" }
    });
    const asset = await moderatePendingMediaAsset(app, request, pendingAsset, {
      filename: upload.filename,
      // Feed photos intentionally follow the same content rules as message photos.
      moderationSurface: "direct_message"
    });
    const explicit = asset.moderation.labels.some((label) => (
      label.normalized_label === "adult_nudity" || label.normalized_label === "adult_explicit"
    ));

    const approved = await app.db.query<{ id: string }>(
      `with candidate_media as (
         select media.id, media.owner_user_id
         from media_objects media
         where media.id = $2
           and media.owner_user_id = $1
           and media.surface = 'feed_photo'
           and media.moderation_status = 'pending'
           and media.deleted_at is null
       ), ${approvedContentReviewCte({
         userIdParam: "$1",
         surface: "direct_message",
         contentType: "image",
         fromCte: "candidate_media",
         providerParam: "$3",
         providerRequestIdParam: "$5",
         normalizedLabelsParam: "$6",
         policyDecisionParam: "$7",
         moderationStatusParam: "'allowed'",
         moderationRawResultParam: "$8",
         contentIdParam: "$2",
         contentRefParam: "jsonb_build_object('assetId', $2, 'surface', 'feed_photo')"
       })}
       update media_objects media
       set public_url = $9,
           moderation_status = 'approved',
           moderation_provider = $3,
           moderation_provider_version = $4,
           moderation_scores = $6::jsonb,
           moderation_decided_at = now(),
           moderation_failure_reason = null,
           moderation_attempts = 0,
           moderation_next_retry_at = null,
           moderation_hold = null,
           explicit_classification = case when $12 then 'explicit' else 'non_explicit' end,
           photodna_status = $10,
           photodna_provider_request_id = $11,
           content_review_id = moderation_review.id
       from candidate_media, moderation_review
       where media.id = candidate_media.id
       returning media.id::text`,
      [
        userId,
        asset.id,
        asset.moderation.provider,
        asset.moderation.providerVersion,
        asset.moderation.providerRequestId,
        JSON.stringify(asset.moderation.labels),
        JSON.stringify(asset.moderation.decision),
        JSON.stringify(asset.moderation.rawResult),
        asset.displayUrl,
        asset.moderation.photoDnaStatus,
        asset.moderation.photoDnaProviderRequestId,
        explicit
      ]
    );

    if (!approved.rows[0]) {
      throw new ApiError(400, "VALIDATION_ERROR", "This Feed photo could not be approved.");
    }

    return reply.code(201).send({
      data: {
        id: asset.id,
        url: asset.displayUrl,
        thumbnailUrl: asset.thumbnailUrl,
        explicit
      }
    });
  } catch (error) {
    if (pendingAsset && isPhotoModerationUnavailable(error)) {
      return reply.code(202).send({
        data: { status: "pending_review", assetId: pendingAsset.id }
      });
    }
    if (pendingAsset && !isModerationEvidenceRetained(error)) {
      await deletePendingMediaAsset(app, request, pendingAsset);
    }
    throw toReportablePhotoUploadError(app, request, error, { surface: "feed_photo", userId });
  }
}
