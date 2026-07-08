import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { ApiError } from "../errors.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { decryptMediaBytes, encryptMediaBytes } from "../media-encryption.js";
import {
  ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX,
  MESSAGE_PHOTO_MEDIA_PREFIX,
  readEncryptedMediaObject,
  writeEncryptedMediaObject
} from "../media-storage.js";
import { approvedContentReviewCte, moderateImageOrReject } from "../moderation-service.js";
import { checkPhotoDna } from "../photodna.js";

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_PHOTOS = 4;
const PROFILE_PHOTO_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

function hasValidImageSignature(buffer: Buffer, mimeType: keyof typeof PROFILE_PHOTO_MIME_TYPES) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
  }

  return buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

function toUploadError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("request file too large") || message.includes("file size")) {
    return new ApiError(400, "VALIDATION_ERROR", "Profile photo must be 5 MB or smaller.");
  }

  return error;
}

const profilePhotoParamsSchema = {
  parse(params: unknown) {
    const filename = (params as { filename?: unknown }).filename;

    if (
      typeof filename !== "string" ||
      !/^[0-9a-f-]{36}-[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\.(jpg|png|webp)$/i.test(filename)
    ) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid media path.");
    }

    return { filename };
  }
};

const messagePhotoParamsSchema = {
  parse(params: unknown) {
    const filename = (params as { filename?: unknown }).filename;

    if (
      typeof filename !== "string" ||
      !/^[0-9a-f-]{36}-[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\.(jpg|png|webp)$/i.test(filename)
    ) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid media path.");
    }

    return { filename };
  }
};

type EncryptedMediaRow = {
  object_key: string;
  mime_type: string;
  encrypted_data_key: string;
  data_key_nonce: string;
  data_key_auth_tag: string;
  content_nonce: string;
  content_auth_tag: string;
  key_version: string;
};

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

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get("/api/media/profile-photos/:filename", async (request, reply) => {
    await getAuthenticatedUserId(request);
    const { filename } = profilePhotoParamsSchema.parse(request.params);
    const publicUrl = `${ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX}/${filename}`;
    const result = await app.db.query<EncryptedMediaRow>(
      `select
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
         and deleted_at is null
       limit 1`,
      [publicUrl]
    );
    const mediaObject = result.rows[0];

    if (!mediaObject) {
      throw new ApiError(404, "NOT_FOUND", "Media not found.");
    }

    return sendEncryptedMedia(app, reply, mediaObject);
  });

  app.get("/api/media/message-photos/:filename", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const { filename } = messagePhotoParamsSchema.parse(request.params);
    const publicUrl = `${MESSAGE_PHOTO_MEDIA_PREFIX}/${filename}`;
    const result = await app.db.query<EncryptedMediaRow>(
      `select
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

  app.post("/api/profile-photos", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);

    await app.rateLimiter.assert({
      key: `profile-photo-upload:${userId}`,
      max: 10,
      windowMs: 60 * 1000,
      message: "Too many profile photo uploads. Try again later."
    });

    let upload;

    try {
      upload = await request.file({
        limits: {
          fileSize: MAX_PROFILE_PHOTO_BYTES,
          files: 1
        }
      });
    } catch (error) {
      throw toUploadError(error);
    }

    if (!upload || upload.fieldname !== "photo") {
      throw new ApiError(400, "VALIDATION_ERROR", "Upload a profile photo in the photo field.");
    }

    const mimeType = upload.mimetype as keyof typeof PROFILE_PHOTO_MIME_TYPES;
    const extension = PROFILE_PHOTO_MIME_TYPES[mimeType];

    if (!extension) {
      throw new ApiError(400, "VALIDATION_ERROR", "Profile photo must be a JPEG, PNG, or WebP image.");
    }

    let buffer: Buffer;

    try {
      buffer = await upload.toBuffer();
    } catch (error) {
      throw toUploadError(error);
    }

    if (buffer.length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Profile photo cannot be empty.");
    }

    if (buffer.length > MAX_PROFILE_PHOTO_BYTES || upload.file.truncated) {
      throw new ApiError(400, "VALIDATION_ERROR", "Profile photo must be 5 MB or smaller.");
    }

    if (!hasValidImageSignature(buffer, mimeType)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Profile photo content does not match its image type.");
    }

    const currentPhotoResult = await app.db.query<{ photos: string[] | null }>(
      "select photos from profiles where id = $1",
      [userId]
    );
    const currentPhotos = currentPhotoResult?.rows?.[0]?.photos ?? [];

    if (currentPhotos.length >= MAX_PROFILE_PHOTOS) {
      throw new ApiError(400, "VALIDATION_ERROR", `You can add up to ${MAX_PROFILE_PHOTOS} photos.`);
    }

    const filename = `${userId}-${randomUUID()}.${extension}`;
    const objectKey = `profile-photos/${filename}.enc`;
    const url = `${ENCRYPTED_PROFILE_PHOTO_MEDIA_PREFIX}/${filename}`;
    const publicImageUrl = new URL(url, app.config.MEDIA_PUBLIC_BASE_URL || app.config.APP_URL).toString();
    const photoDnaResult = await checkPhotoDna(app.config, buffer);

    if (photoDnaResult.status === "blocked") {
      throw new ApiError(400, "CONTENT_REJECTED", "This photo violates Cruush safety rules and cannot be saved.");
    }

    let moderation;

    moderation = await moderateImageOrReject(app, {
      userId,
      surface: "profile_photo",
      mimeType,
      filename: upload.filename,
      imageUrl: publicImageUrl,
      contentId: url,
      contentRef: {
        url,
        objectKey,
        originalFilename: upload.filename,
        mimeType,
        photoDnaStatus: photoDnaResult.status
      },
      bytes: buffer
    });

    const encryptedMedia = encryptMediaBytes(app.config, buffer);
    await writeEncryptedMediaObject(app.config, objectKey, encryptedMedia.ciphertext);

    await app.db.query(
      `insert into media_objects (
         owner_user_id,
         surface,
         object_key,
         public_url,
         media_type,
         mime_type,
         byte_size,
         encrypted_data_key,
         data_key_nonce,
         data_key_auth_tag,
         content_nonce,
         content_auth_tag,
         key_version,
         moderation_status,
         photodna_status,
         photodna_provider_request_id
       )
       values ($1, 'profile_photo', $2, $3, 'image', $4, $5, $6, $7, $8, $9, $10, $11, 'allowed', $12, $13)
       on conflict (public_url) do nothing`,
      [
        userId,
        objectKey,
        url,
        mimeType,
        buffer.length,
        encryptedMedia.encryptedDataKey,
        encryptedMedia.dataKeyNonce,
        encryptedMedia.dataKeyAuthTag,
        encryptedMedia.nonce,
        encryptedMedia.authTag,
        encryptedMedia.keyVersion,
        photoDnaResult.status,
        photoDnaResult.providerRequestId ?? null
      ]
    );

    const savedPhotoResult = await app.db.query<{ photos: string[] | null }>(
      `with eligible_user as (
         select u.id
         from app_users u
         left join user_trust_profiles trust on trust.user_id = u.id
         where u.id = $1
           and coalesce(trust.is_suspended, false) = false
           and coalesce(trust.trust_score, 50) > 20
           and not exists (
             select 1
             from suspensions suspension
             where suspension.user_id = u.id
               and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
           )
           and not exists (
             select 1
             from feature_restrictions restriction
             where restriction.user_id = u.id
               and restriction.feature = 'photo_uploads'
               and (restriction.ends_at is null or restriction.ends_at > now())
           )
       ),
       ${approvedContentReviewCte({
         userIdParam: "$1",
         surface: "profile_photo",
         contentType: "image",
         fromCte: "eligible_user",
         providerParam: "$3",
         providerRequestIdParam: "$4",
         normalizedLabelsParam: "$5",
         policyDecisionParam: "$6",
         moderationStatusParam: "$7",
         flaggedReasonParam: "$8",
         moderationRawResultParam: "$9"
       })}
       insert into profiles (id, photos, updated_at)
       select eligible_user.id, array[$2]::text[], now()
       from eligible_user
       join moderation_review on true
       on conflict (id) do update
       set photos = case
         when array_position(profiles.photos, $2) is not null then profiles.photos
         else array_append(profiles.photos, $2)
       end,
       updated_at = now()
       where array_position(profiles.photos, $2) is not null
          or coalesce(array_length(profiles.photos, 1), 0) < ${MAX_PROFILE_PHOTOS}
       returning photos`,
      [
        userId,
        url,
        moderation.providerResult.provider,
        moderation.providerResult.provider_request_id,
        JSON.stringify(moderation.providerResult.labels),
        JSON.stringify(moderation.decision),
        "allowed",
        null,
        JSON.stringify(moderation.providerResult.raw_result ?? {})
      ]
    );

    if (!savedPhotoResult?.rows?.[0]) {
      throw new ApiError(400, "VALIDATION_ERROR", `You can add up to ${MAX_PROFILE_PHOTOS} photos.`);
    }

    return reply.code(201).send({
      data: {
        url
      }
    });
  });
}
