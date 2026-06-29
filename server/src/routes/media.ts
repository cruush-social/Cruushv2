import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { getAuthenticatedUserId } from "../request-auth.js";
import { getProfilePhotoStorageDir, PROFILE_PHOTO_MEDIA_PREFIX } from "../media-storage.js";
import { approvedContentReviewCte, moderateImageOrReject } from "../moderation-service.js";

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
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

async function removeStoredFile(filePath: string) {
  try {
    await unlink(filePath);
  } catch {
    // Best effort cleanup; the request should still report the database error.
  }
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.post("/api/profile-photos", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

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

    if (currentPhotos.length >= 9) {
      throw new ApiError(400, "VALIDATION_ERROR", "You can add up to 9 photos.");
    }

    const storageDir = getProfilePhotoStorageDir(app.config);
    await mkdir(storageDir, { recursive: true });

    const filename = `${userId}-${randomUUID()}.${extension}`;
    const filePath = path.join(storageDir, filename);
    const url = `${PROFILE_PHOTO_MEDIA_PREFIX}/${filename}`;
    const publicImageUrl = new URL(url, app.config.APP_URL).toString();
    await writeFile(filePath, buffer, { flag: "wx" });

    let moderation;

    try {
      moderation = await moderateImageOrReject(app, {
        userId,
        surface: "profile_photo",
        mimeType,
        filename: upload.filename,
        imageUrl: publicImageUrl,
        contentId: url,
        contentRef: {
          url,
          originalFilename: upload.filename,
          mimeType
        },
        bytes: buffer
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "MODERATION_UNAVAILABLE") {
        throw error;
      }

      await removeStoredFile(filePath);
      throw error;
    }

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
          or coalesce(array_length(profiles.photos, 1), 0) < 9
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
    ).catch(async (error) => {
      await removeStoredFile(filePath);
      throw error;
    });

    if (!savedPhotoResult?.rows?.[0]) {
      await removeStoredFile(filePath);
      throw new ApiError(400, "VALIDATION_ERROR", "You can add up to 9 photos.");
    }

    return reply.code(201).send({
      data: {
        url
      }
    });
  });
}
