import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { toReportablePhotoUploadError } from "../photo-upload-incident.js";
import {
  createPendingMediaAsset,
  deletePendingMediaAsset,
  moderatePendingMediaAsset,
  removeOwnedNonPublicMediaAsset
} from "../media-assets.js";
import { decryptMediaBytes } from "../media-encryption.js";
import { MAX_IMAGE_BYTES, processUploadedImage } from "../media-image.js";
import {
  verifyMediaModerationInspectionSignature
} from "../media-moderation-url.js";
import {
  ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX,
  MESSAGE_PHOTO_MEDIA_PREFIX,
  readEncryptedMediaObject
} from "../media-storage.js";
import { approvedContentReviewCte } from "../moderation-service.js";
import { userHasOwnerFullAccess } from "../owner-access.js";
import { photoUploadAvailability } from "../photo-upload-availability.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { assertUsersNotBlocked } from "../user-blocks.js";

const MAX_PROFILE_PHOTOS = 4;
const mediaUuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const profilePhotoFilenameSchema = z.object({
  filename: z.string().regex(new RegExp(`^(?:${mediaUuidPattern}-)?${mediaUuidPattern}\\.(jpg|png|webp)$`, "i"))
}).strict();
const mediaAssetParamsSchema = z.object({
  assetId: z.uuid(),
  variant: z.enum(["thumbnail", "display"])
}).strict();
const mediaAssetIdParamsSchema = z.object({
  assetId: z.uuid()
}).strict();
const moderationMediaQuerySchema = z.object({
  purpose: z.string(),
  expires: z.string(),
  signature: z.string()
}).strict();
const ownedMediaQuerySchema = z.object({
  surface: z.enum(["profile_photo", "message_photo"]).optional()
}).strict();

type EncryptedMediaRow = {
  owner_user_id: string;
  surface: "profile_photo" | "message_photo";
  object_key: string;
  mime_type: string;
  encrypted_data_key: string;
  data_key_nonce: string;
  data_key_auth_tag: string;
  content_nonce: string;
  content_auth_tag: string;
  key_version: string;
};

type OwnedMediaRow = {
  id: string;
  surface: "profile_photo" | "message_photo";
  mime_type: string;
  width: number | null;
  height: number | null;
  byte_size: number;
  moderation_status: string;
  explicit_classification: string;
  public_url: string | null;
  moderation_decided_at: string | Date | null;
  created_at: string | Date;
};

type CurrentProfilePhotoStateRow = {
  photos: string[] | null;
  photo_uploads_allowed: boolean | null;
};

export function parseProfilePhotoFilename(params: unknown) {
  const result = profilePhotoFilenameSchema.safeParse(params);

  if (!result.success) {
    throw new ApiError(404, "NOT_FOUND", "Invalid media path.");
  }

  return result.data;
}

async function sendEncryptedMedia(app: FastifyInstance, reply: FastifyReply, mediaObject: EncryptedMediaRow) {
  const encryptedBytes = await readEncryptedMediaObject(app.config, mediaObject.object_key);
  const bytes = decryptMediaBytes(app.config, {
    ciphertext: encryptedBytes,
    nonce: mediaObject.content_nonce,
    authTag: mediaObject.content_auth_tag,
    encryptedDataKey: mediaObject.encrypted_data_key,
    dataKeyNonce: mediaObject.data_key_nonce,
    dataKeyAuthTag: mediaObject.data_key_auth_tag,
    keyVersion: mediaObject.key_version
  });

  return reply
    .type(mediaObject.mime_type)
    .header("cache-control", "private, max-age=300")
    .send(bytes);
}

async function sendModerationMedia(
  app: FastifyInstance,
  reply: FastifyReply,
  assetId: string,
  mediaObject: EncryptedMediaRow,
  method: string
) {
  const capabilityHeaders = reply
    .type("image/webp")
    .header("cache-control", "private, no-store, max-age=0")
    .header("x-content-type-options", "nosniff");

  if (method === "HEAD") {
    return capabilityHeaders.send();
  }

  try {
    const encryptedBytes = await readEncryptedMediaObject(app.config, mediaObject.object_key);
    const bytes = decryptMediaBytes(app.config, {
      ciphertext: encryptedBytes,
      nonce: mediaObject.content_nonce,
      authTag: mediaObject.content_auth_tag,
      encryptedDataKey: mediaObject.encrypted_data_key,
      dataKeyNonce: mediaObject.data_key_nonce,
      dataKeyAuthTag: mediaObject.data_key_auth_tag,
      keyVersion: mediaObject.key_version
    });

    return capabilityHeaders
      .send(bytes);
  } catch {
    app.log.error({ assetId, stage: "moderation_media_fetch" }, "moderation media fetch failed");
    throw new ApiError(404, "NOT_FOUND", "Media not found.");
  }
}

async function assertMessageMediaAccess(app: FastifyInstance, userId: string, assetId: string) {
  const result = await app.db.query<{ allowed: boolean }>(
    `select true as allowed
     from message_media_attachments attachment
     join messages message on message.id = attachment.message_id
     join conversations conversation on conversation.id = message.conversation_id
     join conversation_members member
       on member.conversation_id = message.conversation_id
      and member.user_id = $2
     where attachment.media_object_id = $1
       and attachment.view_once = false
       and (message.expires_at is null or message.expires_at > now())
       and (conversation.cleared_at is null or message.created_at > conversation.cleared_at)
     limit 1`,
    [assetId, userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new ApiError(404, "NOT_FOUND", "Media not found.");
  }
}

function toUploadError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("request file too large") || message.includes("file size")) {
    return new ApiError(400, "VALIDATION_ERROR", "Profile photo must be 5 MB or smaller.");
  }

  return error;
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.route({
    method: ["GET", "HEAD"],
    url: "/api/media/moderation/:assetId/display",
    exposeHeadRoute: false,
    logLevel: "silent",
    handler: async (request, reply) => {
    const params = mediaAssetIdParamsSchema.safeParse(request.params);
    const query = moderationMediaQuerySchema.safeParse(request.query);

    if (!params.success || !query.success || !verifyMediaModerationInspectionSignature(app.config, {
      assetId: params.success ? params.data.assetId : "",
      method: "GET",
      variant: "display",
      purpose: query.success ? query.data.purpose : "",
      expires: query.success ? query.data.expires : "",
      signature: query.success ? query.data.signature : ""
    })) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }

    const assetId = params.data.assetId;
    const result = await app.db.query<EncryptedMediaRow>(
      `select
         media.owner_user_id::text,
         media.surface,
         variant.object_key,
         variant.mime_type,
         variant.encrypted_data_key,
         variant.data_key_nonce,
         variant.data_key_auth_tag,
         variant.content_nonce,
         variant.content_auth_tag,
         variant.key_version
       from media_objects media
       join app_users owner on owner.id = media.owner_user_id
       join media_variants variant on variant.media_object_id = media.id
       where media.id = $1
         and media.moderation_status = 'pending'
         and media.deleted_at is null
         and owner.account_status = 'active'
         and variant.variant_type = 'display'
         and variant.mime_type = 'image/webp'
         and variant.deleted_at is null
       limit 1`,
      [assetId]
    );
    const mediaObject = result.rows[0];

    if (!mediaObject) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }

      return sendModerationMedia(app, reply, assetId, mediaObject, request.method);
    }
  });

  app.get("/api/media/profile-photos/:filename", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { filename } = parseProfilePhotoFilename(request.params);
    const publicUrl = `${ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX}/${filename}`;
    const result = await app.db.query<EncryptedMediaRow>(
      `select
         owner_user_id::text,
         surface,
         object_key,
         mime_type,
         encrypted_data_key,
         data_key_nonce,
         data_key_auth_tag,
         content_nonce,
         content_auth_tag,
         key_version
       from media_objects
       where public_url = $1
         and surface = 'profile_photo'
         and moderation_status = 'approved'
         and legacy_asset = true
         and deleted_at is null
       limit 1`,
      [publicUrl]
    );
    const mediaObject = result.rows[0];

    if (!mediaObject) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }

    if (mediaObject.owner_user_id !== userId) {
      await assertUsersNotBlocked(app, userId, mediaObject.owner_user_id);
    }

    return sendEncryptedMedia(app, reply, mediaObject);
  });

  app.get("/api/media/message-photos/:filename", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { filename } = parseProfilePhotoFilename(request.params);
    const publicUrl = `${MESSAGE_PHOTO_MEDIA_PREFIX}/${filename}`;
    const result = await app.db.query<EncryptedMediaRow>(
      `select
         media.owner_user_id::text,
         media.surface,
         media.object_key,
         media.mime_type,
         media.encrypted_data_key,
         media.data_key_nonce,
         media.data_key_auth_tag,
         media.content_nonce,
         media.content_auth_tag,
         media.key_version
       from media_objects media
       join message_media_attachments attachment on attachment.media_object_id = media.id
       join messages message on message.id = attachment.message_id
       join conversations conversation on conversation.id = message.conversation_id
       join conversation_members member
         on member.conversation_id = message.conversation_id
        and member.user_id = $2
       where media.public_url = $1
         and media.surface = 'message_photo'
         and media.moderation_status = 'approved'
         and media.legacy_asset = true
         and media.deleted_at is null
         and attachment.view_once = false
         and (message.expires_at is null or message.expires_at > now())
         and (conversation.cleared_at is null or message.created_at > conversation.cleared_at)
       limit 1`,
      [publicUrl, userId]
    );
    const mediaObject = result.rows[0];

    if (!mediaObject) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }

    return sendEncryptedMedia(app, reply, mediaObject);
  });

  app.get("/api/media/assets/:assetId/:variant", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { assetId, variant } = mediaAssetParamsSchema.parse(request.params);
    const result = await app.db.query<EncryptedMediaRow>(
      `select
         media.owner_user_id::text,
         media.surface,
         variant.object_key,
         variant.mime_type,
         variant.encrypted_data_key,
         variant.data_key_nonce,
         variant.data_key_auth_tag,
         variant.content_nonce,
         variant.content_auth_tag,
         variant.key_version
       from media_objects media
       join media_variants variant on variant.media_object_id = media.id
       where media.id = $1
         and variant.variant_type = $2
         and media.moderation_status = 'approved'
         and media.surface in ('message_photo', 'profile_photo')
         and media.deleted_at is null
         and variant.deleted_at is null
       limit 1`,
      [assetId, variant]
    );
    const mediaObject = result.rows[0];

    if (!mediaObject) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }

    if (mediaObject.surface === "profile_photo") {
      if (mediaObject.owner_user_id !== userId) {
        await assertUsersNotBlocked(app, userId, mediaObject.owner_user_id);
      }
    } else if (mediaObject.owner_user_id !== userId) {
      await assertMessageMediaAccess(app, userId, assetId);
    }

    return sendEncryptedMedia(app, reply, mediaObject);
  });

  app.get("/api/media/assets/me", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    const query = ownedMediaQuerySchema.parse(request.query);
    const result = await app.db.query<OwnedMediaRow>(
      `select
         id::text,
         surface,
         mime_type,
         width,
         height,
         byte_size,
         moderation_status,
         explicit_classification,
         case when moderation_status = 'approved' then public_url else null end as public_url,
         moderation_decided_at,
         created_at
       from media_objects
       where owner_user_id = $1
         and deleted_at is null
         and ($2::text is null or surface = $2)
       order by created_at desc
       limit 100`,
      [userId, query.surface ?? null]
    );

    return {
      data: {
        assets: result.rows.map((row) => ({
          id: row.id,
          surface: row.surface,
          mimeType: row.mime_type,
          width: row.width,
          height: row.height,
          byteSize: row.byte_size,
          moderationStatus: row.moderation_status,
          explicitClassification: row.explicit_classification,
          url: row.public_url,
          decidedAt: row.moderation_decided_at ? new Date(row.moderation_decided_at).toISOString() : null,
          createdAt: new Date(row.created_at).toISOString()
        }))
      }
    };
  });

  app.delete("/api/media/assets/:assetId", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const { assetId } = mediaAssetIdParamsSchema.parse(request.params);
    await removeOwnedNonPublicMediaAsset(app, request, assetId, userId);
    return reply.code(204).send();
  });

  app.post("/api/profile-photos", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const ownerFullAccess = await userHasOwnerFullAccess(app, userId);

    if (!photoUploadAvailability(app.config).profilePhotos) {
      throw new ApiError(503, "FEATURE_RESTRICTED", "Profile photo uploads are temporarily unavailable.");
    }

    await app.rateLimiter.assert({
      key: `profile-photo-upload:${userId}`,
      max: 10,
      windowMs: 60 * 1000,
      message: "Too many profile photo uploads. Try again later."
    });

    let upload;

    try {
      upload = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
    } catch (error) {
      throw toUploadError(error);
    }

    if (!upload || upload.fieldname !== "photo") {
      throw new ApiError(400, "VALIDATION_ERROR", "Upload a profile photo in the photo field.");
    }

    let bytes: Buffer;

    try {
      bytes = await upload.toBuffer();
    } catch (error) {
      throw toUploadError(error);
    }

    if (upload.file.truncated) {
      throw new ApiError(400, "VALIDATION_ERROR", "Profile photo must be 5 MB or smaller.");
    }

    const processed = await processUploadedImage(bytes, upload.mimetype);
    const currentPhotoResult = await app.db.query<CurrentProfilePhotoStateRow>(
      `select
         (select photos from profiles where id = $1) as photos,
         exists (
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
                     and restriction.feature = 'photo_uploads'
                     and (restriction.ends_at is null or restriction.ends_at > now())
                 )
               )
             )
         ) as photo_uploads_allowed`,
      [userId, ownerFullAccess]
    );
    const currentPhotoState = currentPhotoResult.rows[0];
    const currentPhotos = currentPhotoState?.photos ?? [];

    if (currentPhotoState?.photo_uploads_allowed === false) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Photo uploads are unavailable for this account.");
    }

    if (currentPhotos.length >= MAX_PROFILE_PHOTOS) {
      throw new ApiError(400, "VALIDATION_ERROR", `You can add up to ${MAX_PROFILE_PHOTOS} photos.`);
    }

    let pendingAsset: Awaited<ReturnType<typeof createPendingMediaAsset>> | null = null;

    try {
      pendingAsset = await createPendingMediaAsset(app, request, {
        ownerUserId: userId,
        surface: "profile_photo",
        processed
      });
      const asset = await moderatePendingMediaAsset(app, request, pendingAsset, {
        filename: upload.filename,
        moderationSurface: "profile_photo"
      });
      const isAdultExplicit = asset.moderation.labels.some((label) =>
        label.normalized_label === "adult_nudity" || label.normalized_label === "adult_explicit"
      );

      const savedPhotoResult = await app.db.query<{ photos: string[] | null }>(
        `with eligible_user as (
           select app_user.id
           from app_users app_user
           left join user_trust_profiles trust on trust.user_id = app_user.id
           where app_user.id = $1
             and (
               $13::boolean
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
                     and restriction.feature = 'photo_uploads'
                     and (restriction.ends_at is null or restriction.ends_at > now())
                 )
               )
             )
         ), candidate_media as (
           select media.id, media.owner_user_id
           from media_objects media
           join eligible_user on eligible_user.id = media.owner_user_id
           where media.id = $2
             and media.surface = 'profile_photo'
             and media.moderation_status = 'pending'
             and coalesce((select array_length(profile.photos, 1) from profiles profile where profile.id = $1), 0) < ${MAX_PROFILE_PHOTOS}
         ), ${approvedContentReviewCte({
           userIdParam: "$1",
           surface: "profile_photo",
           contentType: "image",
           fromCte: "candidate_media",
           providerParam: "$4",
           providerRequestIdParam: "$6",
           normalizedLabelsParam: "$7",
           policyDecisionParam: "$8",
           moderationStatusParam: "'allowed'",
           moderationRawResultParam: "$9",
           contentIdParam: "$2",
           contentRefParam: "jsonb_build_object('assetId', $2, 'surface', 'profile_photo')"
         })}, approved_media as (
           update media_objects media
           set public_url = $3,
               moderation_status = 'approved',
               moderation_provider = $4,
               moderation_provider_version = $5,
               moderation_scores = $7::jsonb,
               moderation_decided_at = now(),
               moderation_failure_reason = null,
               explicit_classification = case when $12 then 'explicit' else 'non_explicit' end,
               photodna_status = $10,
               photodna_provider_request_id = $11,
               content_review_id = moderation_review.id
           from candidate_media, moderation_review
           where media.id = candidate_media.id
           returning media.owner_user_id as id
         )
         insert into profiles (id, photos, updated_at)
         select linked_media.id, array[$3]::text[], now()
         from approved_media linked_media
         on conflict (id) do update
         set photos = case
           when array_position(profiles.photos, $3) is not null then profiles.photos
           else array_append(profiles.photos, $3)
         end,
         updated_at = now()
         where array_position(profiles.photos, $3) is not null
            or coalesce(array_length(profiles.photos, 1), 0) < ${MAX_PROFILE_PHOTOS}
         returning photos`,
        [
          userId,
          asset.id,
          asset.displayUrl,
          asset.moderation.provider,
          asset.moderation.providerVersion,
          asset.moderation.providerRequestId,
          JSON.stringify(asset.moderation.labels),
          JSON.stringify(asset.moderation.decision),
          JSON.stringify(asset.moderation.rawResult),
          asset.moderation.photoDnaStatus,
          asset.moderation.photoDnaProviderRequestId,
          isAdultExplicit,
          ownerFullAccess
        ]
      );
      if (!savedPhotoResult.rows[0]) {
        throw new ApiError(400, "VALIDATION_ERROR", `You can add up to ${MAX_PROFILE_PHOTOS} photos.`);
      }

      return reply.code(201).send({
        data: {
          url: asset.displayUrl,
          explicit: isAdultExplicit
        }
      });
    } catch (error) {
      if (pendingAsset) {
        await deletePendingMediaAsset(app, request, pendingAsset);
      }
      throw toReportablePhotoUploadError(app, request, error, { surface: "profile_photo", userId });
    }
  });
}
