import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { toReportablePhotoUploadError } from "../photo-upload-incident.js";
import {
  createPendingMediaAsset,
  deletePendingMediaAsset,
  isModerationEvidenceRetained,
  isPhotoModerationUnavailable,
  moderatePendingMediaAsset,
  removeOwnedNonPublicMediaAsset
} from "../media-assets.js";
import { decryptMediaBytes } from "../media-encryption.js";
import { MAX_IMAGE_BYTES, MAX_PHOTO_SOURCE_BYTES, processUploadedImage } from "../media-image.js";
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
import { recordMediaRead } from "../media-read-budget.js";
import { assertUsersNotBlocked } from "../user-blocks.js";
import { getRelationshipPermissions } from "../match-relationships.js";

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
  surface: z.enum(["profile_photo", "message_photo", "feed_photo"]).optional()
}).strict();

type EncryptedMediaRow = {
  owner_user_id: string;
  surface: "profile_photo" | "message_photo" | "feed_photo";
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
  surface: "profile_photo" | "message_photo" | "feed_photo";
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

function buildMediaEntityTag(mediaObject: EncryptedMediaRow) {
  // Object keys are unique per stored variant and the encrypted bytes behind one
  // are never rewritten, so the key plus its wrapping key version is a stable
  // strong validator for that exact body.
  const digest = createHash("sha256")
    .update(`${mediaObject.object_key}:${mediaObject.key_version}`)
    .digest("hex")
    .slice(0, 32);

  return `"${digest}"`;
}

function requestMatchesEntityTag(request: FastifyRequest, entityTag: string) {
  const header = request.headers["if-none-match"];

  if (!header) {
    return false;
  }

  const candidates = (Array.isArray(header) ? header.join(",") : header)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return candidates.some(
    (candidate) => candidate === "*" || candidate.replace(/^W\//, "") === entityTag
  );
}

async function sendEncryptedMedia(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  mediaObject: EncryptedMediaRow,
  viewerUserId: string
) {
  const entityTag = buildMediaEntityTag(mediaObject);

  // "no-cache" tells the client to revalidate on every view rather than to skip
  // storing the body. Authentication and the per-surface authorization checks
  // therefore run again on each request, so a block, a deletion or a withdrawn
  // moderation approval takes effect immediately instead of lingering in a
  // browser cache. A matching validator still avoids the object read, the
  // decrypt and the transfer.
  reply.header("cache-control", "private, no-cache").header("etag", entityTag);

  const observation = {
    viewerUserId,
    objectKey: mediaObject.object_key,
    surface: mediaObject.surface
  };

  if (requestMatchesEntityTag(request, entityTag)) {
    recordMediaRead(request.log, { ...observation, revalidated: true });

    return reply.code(304).send();
  }

  recordMediaRead(request.log, { ...observation, revalidated: false });

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

  return reply.type(mediaObject.mime_type).send(bytes);
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

async function assertFeedMediaAccess(app: FastifyInstance, userId: string, assetId: string) {
  const access = (await app.db.query<{
    owner_user_id: string;
    audience: "public" | "mutuals" | "crowd";
    has_shared_crowd: boolean;
  }>(
    `select
       post.user_id::text as owner_user_id,
       coalesce(post.audience, 'public') as audience,
       exists (
         select 1
         from feed_post_crowd_targets target
         join profile_sensitive_tokens viewer_token
           on viewer_token.user_id = $2
          and viewer_token.token_hash = target.token_hash
          and viewer_token.token_key_version = target.token_key_version
         where target.post_id = post.id
       ) as has_shared_crowd
     from feed_post_attachments attachment
     join posts post on post.id = attachment.post_id
     where attachment.media_object_id = $1
       and post.expires_at > now()
     limit 1`,
    [assetId, userId]
  )).rows[0];

  if (!access) {
    throw new ApiError(404, "NOT_FOUND", "Media not found.");
  }
  if (access.owner_user_id === userId) {
    return;
  }

  await assertUsersNotBlocked(app, userId, access.owner_user_id);
  if (access.audience === "public") {
    return;
  }
  if (access.audience === "crowd" && access.has_shared_crowd) {
    return;
  }
  if (access.audience === "mutuals") {
    const relationship = await getRelationshipPermissions(app, userId, access.owner_user_id);
    if (relationship.isMutualCruush) {
      return;
    }
  }

  throw new ApiError(404, "NOT_FOUND", "Media not found.");
}

function toUploadError(error: unknown, cameraOriginal = false) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("request file too large") || message.includes("file size")) {
    return new ApiError(400, "VALIDATION_ERROR", cameraOriginal ? "Camera original must be 128 MB or smaller." : "Profile photo must be 5 MB or smaller.");
  }

  return error;
}

async function assertProfilePhotoUploadAllowed(app: FastifyInstance, userId: string, ownerFullAccess: boolean) {
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

    return sendEncryptedMedia(app, request, reply, mediaObject, userId);
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

    return sendEncryptedMedia(app, request, reply, mediaObject, userId);
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
         and media.surface in ('message_photo', 'profile_photo', 'feed_photo')
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
    } else if (mediaObject.surface === "feed_photo") {
      await assertFeedMediaAccess(app, userId, assetId);
    } else if (mediaObject.owner_user_id !== userId) {
      await assertMessageMediaAccess(app, userId, assetId);
    }

    return sendEncryptedMedia(app, request, reply, mediaObject, userId);
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

  for (const route of ["/api/profile-photos/preview", "/api/profile-photos/prepare"]) {
    app.post(route, async (request, reply) => {
      const userId = await getActiveAccountUserId(request);
      await app.rateLimiter.assert({
        key: `profile-photo-preview:${userId}`,
        max: 10,
        windowMs: 60 * 1000,
        message: "Too many photo previews. Try again in a minute."
      });
      if (route === "/api/profile-photos/prepare") {
        if (!photoUploadAvailability(app.config).profilePhotos) {
          throw new ApiError(503, "FEATURE_RESTRICTED", "Profile photo uploads are temporarily unavailable.");
        }
        await assertProfilePhotoUploadAllowed(app, userId, await userHasOwnerFullAccess(app, userId));
      }
      let upload;
      let bytes: Buffer;
      try {
        upload = await request.file({ limits: { fileSize: MAX_PHOTO_SOURCE_BYTES, files: 1 } });
        if (!upload || upload.fieldname !== "photo") {
          throw new ApiError(400, "VALIDATION_ERROR", "Choose a photo to preview.");
        }
        bytes = await upload.toBuffer();
      } catch (error) {
        throw toUploadError(error, true);
      }
      if (upload.file.truncated) {
        throw new ApiError(400, "VALIDATION_ERROR", "Camera original must be 128 MB or smaller.");
      }
      const processed = await processUploadedImage(bytes, upload.mimetype, { cameraOriginal: true });
      const mimeType = processed.canonicalMimeType ?? processed.detectedMimeType;
      if (route === "/api/profile-photos/prepare") {
        const pending = await createPendingMediaAsset(app, request, {
          ownerUserId: userId,
          surface: "profile_photo",
          processed
        });
        try {
          const candidate = await moderatePendingMediaAsset(app, request, pending, {
            filename: upload.filename,
            moderationSurface: "profile_photo"
          });
          if (candidate.moderation.decision.decision !== "allow") {
            throw new ApiError(400, "CONTENT_REJECTED", "Photo was not approved.");
          }
        } catch (error) {
          if (!isModerationEvidenceRetained(error)) {
            await deletePendingMediaAsset(app, request, pending);
          }
          throw toReportablePhotoUploadError(app, request, error, { surface: "profile_photo", userId });
        }
        await deletePendingMediaAsset(app, request, pending);
      }
      // The response is private. Preparing a crop never attaches or publishes a
      // profile photo; the final edited upload retains its own moderation checks.
      return reply.header("Cache-Control", "no-store").send({
        data: { url: `data:${mimeType};base64,${processed.canonicalBytes.toString("base64")}` }
      });
    });
  }

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
    await assertProfilePhotoUploadAllowed(app, userId, ownerFullAccess);

    let pendingAsset: Awaited<ReturnType<typeof createPendingMediaAsset>> | null = null;

    try {
      pendingAsset = await createPendingMediaAsset(app, request, {
        ownerUserId: userId,
        surface: "profile_photo",
        processed,
        moderationHold: { kind: "profile_photo" }
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
               moderation_attempts = 0,
               moderation_next_retry_at = null,
               moderation_hold = null,
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
          explicit: isAdultExplicit,
          photos: savedPhotoResult.rows[0].photos ?? [asset.displayUrl]
        }
      });
    } catch (error) {
      if (pendingAsset && isPhotoModerationUnavailable(error)) {
        return reply.code(202).send({
          data: {
            status: "pending_review",
            assetId: pendingAsset.id
          }
        });
      }
      if (pendingAsset && !isModerationEvidenceRetained(error)) {
        await deletePendingMediaAsset(app, request, pendingAsset);
      }
      throw toReportablePhotoUploadError(app, request, error, { surface: "profile_photo", userId });
    }
  });
}
