import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { checkPhotoDnaForUploadOrReject } from "./csam-reporting.js";
import { ApiError } from "./errors.js";
import { encryptMediaBytes } from "./media-encryption.js";
import type { ProcessedImage } from "./media-image.js";
import { createMediaModerationInspectionUrl } from "./media-moderation-url.js";
import {
  cleanupModerationMediaGrants,
  createModerationMediaGrant,
  deleteModerationMediaGrant,
  revokeModerationMediaGrant,
  wasModerationMediaGrantRedeemed
} from "./moderation-media-grants.js";
import {
  deleteEncryptedMediaObject,
  writeEncryptedMediaObject
} from "./media-storage.js";
import { createModerationProvider } from "./moderation-provider.js";
import { moderateImageOrReject } from "./moderation-service.js";
import type { PolicyDecision, ProviderModerationResult } from "./moderation-types.js";
import type { PhotoDnaResult } from "./photodna.js";
import { severeAccessBanIdentity } from "./severe-access-bans.js";

export type MediaSurface = "profile_photo" | "message_photo";

type PendingModerationGrant = {
  id: string;
  token: string;
  expiresAt: Date;
};

export type PendingMediaAsset = {
  id: string;
  ownerUserId: string;
  surface: MediaSurface;
  mimeType: ProcessedImage["detectedMimeType"];
  width: number;
  height: number;
  byteSize: number;
  displayUrl: string;
  thumbnailUrl: string;
  canonicalBytes: Buffer;
  objectKeys: string[];
  grant?: PendingModerationGrant;
};

export type ApprovedMediaCandidate = PendingMediaAsset & {
  moderation: {
    provider: string;
    providerVersion: string;
    providerRequestId: string;
    labels: ProviderModerationResult["labels"];
    decision: PolicyDecision;
    rawResult: Record<string, unknown>;
    photoDnaStatus: string;
    photoDnaProviderRequestId: string | null;
  };
};

function assetUrl(assetId: string, variant: "display" | "thumbnail") {
  return `/api/media/assets/${assetId}/${variant}`;
}

function deployedSafetyReadyBeforePhotoDna(app: FastifyInstance) {
  return app.config.STREAM_IMAGE_BRIDGE_ENABLED === true &&
    app.config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true &&
    app.config.PROFILE_PHOTO_REKOGNITION_ENABLED === true;
}

function shouldBypassPhotoDnaForLaunchUploads(app: FastifyInstance) {
  return deployedSafetyReadyBeforePhotoDna(app);
}

async function deleteObjectsBestEffort(
  app: FastifyInstance,
  request: FastifyRequest,
  assetId: string,
  objectKeys: string[]
) {
  let complete = true;

  for (const objectKey of new Set(objectKeys)) {
    try {
      await deleteEncryptedMediaObject(app.config, objectKey);
    } catch (error) {
      complete = false;
      request.log.error({ err: error, assetId, stage: "media_cleanup" }, "media object cleanup failed");
    }
  }

  return complete;
}

export async function deletePendingMediaAsset(
  app: FastifyInstance,
  request: FastifyRequest,
  asset: PendingMediaAsset
) {
  if (asset.grant) {
    try {
      await revokeModerationMediaGrant(app.db, asset.grant.id);
    } catch (error) {
      request.log.error({ err: error, assetId: asset.id, stage: "grant_revoke" }, "moderation grant revocation failed");
    }
  }

  const objectsDeleted = await deleteObjectsBestEffort(app, request, asset.id, asset.objectKeys);

  if (!objectsDeleted) {
    return false;
  }

  try {
    await app.db.query("delete from media_objects where id = $1", [asset.id]);
    return true;
  } catch (error) {
    request.log.error({ err: error, assetId: asset.id, stage: "media_row_cleanup" }, "media row cleanup failed");
    return false;
  }
}

export async function createPendingMediaAsset(
  app: FastifyInstance,
  request: FastifyRequest,
  input: {
    ownerUserId: string;
    surface: MediaSurface;
    processed: ProcessedImage;
  }
): Promise<PendingMediaAsset> {
  const id = randomUUID();
  const originalObjectKey = `originals/${id}.enc`;
  const canonicalEncrypted = encryptMediaBytes(app.config, input.processed.canonicalBytes);
  const storedObjectKeys: string[] = [];

  if (app.config.BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED === true) {
    try {
      await cleanupModerationMediaGrants(app.db, app.config, 10);
    } catch (error) {
      request.log.warn({ err: error, stage: "moderation_grant_cleanup" }, "opportunistic moderation grant cleanup failed");
    }
  }

  try {
    await writeEncryptedMediaObject(app.config, originalObjectKey, canonicalEncrypted.ciphertext);
    storedObjectKeys.push(originalObjectKey);

    const encryptedVariants = input.processed.variants.map((variant) => ({
      ...variant,
      objectKey: `variants/${id}/${variant.type}.webp.enc`,
      encrypted: encryptMediaBytes(app.config, variant.bytes)
    }));

    for (const variant of encryptedVariants) {
      await writeEncryptedMediaObject(app.config, variant.objectKey, variant.encrypted.ciphertext);
      storedObjectKeys.push(variant.objectKey);
    }

    const thumbnail = encryptedVariants.find((variant) => variant.type === "thumbnail");
    const display = encryptedVariants.find((variant) => variant.type === "display");

    if (!thumbnail || !display) {
      throw new Error("Required image variants were not produced.");
    }

    const result = await app.db.query<{ id: string }>(
      `with inserted_media as (
         insert into media_objects (
           id,
           owner_user_id,
           surface,
           object_key,
           public_url,
           media_type,
           mime_type,
           byte_size,
           width,
           height,
           encrypted_data_key,
           data_key_nonce,
           data_key_auth_tag,
           content_nonce,
           content_auth_tag,
           key_version,
           moderation_status,
           explicit_classification
         ) values (
           $1, $2, $3, $4, null, 'image', $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, 'pending', 'unknown'
         )
         returning id
       ), inserted_variants as (
         insert into media_variants (
           media_object_id,
           variant_type,
           object_key,
           mime_type,
           width,
           height,
           byte_size,
           encrypted_data_key,
           data_key_nonce,
           data_key_auth_tag,
           content_nonce,
           content_auth_tag,
           key_version
         ) values
         (
           $1, 'thumbnail', $15, $16, $17, $18, $19,
           $20, $21, $22, $23, $24, $25
         ),
         (
           $1, 'display', $26, $27, $28, $29, $30,
           $31, $32, $33, $34, $35, $36
         )
         returning media_object_id
       )
       select inserted_media.id::text as id
       from inserted_media
       where exists (select 1 from inserted_variants)`,
      [
        id,
        input.ownerUserId,
        input.surface,
        originalObjectKey,
        input.processed.detectedMimeType,
        input.processed.canonicalBytes.length,
        input.processed.width,
        input.processed.height,
        canonicalEncrypted.encryptedDataKey,
        canonicalEncrypted.dataKeyNonce,
        canonicalEncrypted.dataKeyAuthTag,
        canonicalEncrypted.nonce,
        canonicalEncrypted.authTag,
        canonicalEncrypted.keyVersion,
        thumbnail.objectKey,
        thumbnail.mimeType,
        thumbnail.width,
        thumbnail.height,
        thumbnail.bytes.length,
        thumbnail.encrypted.encryptedDataKey,
        thumbnail.encrypted.dataKeyNonce,
        thumbnail.encrypted.dataKeyAuthTag,
        thumbnail.encrypted.nonce,
        thumbnail.encrypted.authTag,
        thumbnail.encrypted.keyVersion,
        display.objectKey,
        display.mimeType,
        display.width,
        display.height,
        display.bytes.length,
        display.encrypted.encryptedDataKey,
        display.encrypted.dataKeyNonce,
        display.encrypted.dataKeyAuthTag,
        display.encrypted.nonce,
        display.encrypted.authTag,
        display.encrypted.keyVersion
      ]
    );

    if (!result.rows[0]?.id) {
      throw new Error("Media asset insert did not return an id.");
    }

    const grant = app.config.BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED === true
      ? await createModerationMediaGrant(app.db, {
          mediaObjectId: id,
          ownerUserId: input.ownerUserId,
          objectKey: originalObjectKey,
          mimeType: input.processed.detectedMimeType,
          byteSize: input.processed.canonicalBytes.length,
          encryptedDataKey: canonicalEncrypted.encryptedDataKey,
          dataKeyNonce: canonicalEncrypted.dataKeyNonce,
          dataKeyAuthTag: canonicalEncrypted.dataKeyAuthTag,
          contentNonce: canonicalEncrypted.nonce,
          contentAuthTag: canonicalEncrypted.authTag,
          keyVersion: canonicalEncrypted.keyVersion
        })
      : undefined;

    return {
      id,
      ownerUserId: input.ownerUserId,
      surface: input.surface,
      mimeType: input.processed.detectedMimeType,
      width: input.processed.width,
      height: input.processed.height,
      byteSize: input.processed.canonicalBytes.length,
      displayUrl: assetUrl(id, "display"),
      thumbnailUrl: assetUrl(id, "thumbnail"),
      canonicalBytes: input.processed.canonicalBytes,
      objectKeys: [...storedObjectKeys],
      ...(grant ? { grant } : {})
    };
  } catch (error) {
    await deleteObjectsBestEffort(app, request, id, storedObjectKeys);

    try {
      await app.db.query("delete from media_objects where id = $1", [id]);
    } catch {
      // If the insert never happened or the database is unavailable, there is no further in-request cleanup to perform.
    }

    request.log.error({ err: error, assetId: id, stage: "media_ingestion" }, "media ingestion failed");
    throw new ApiError(500, "INTERNAL_ERROR", "Unable to process this image right now.");
  }
}

function moderationMediaUrl(app: FastifyInstance, asset: PendingMediaAsset) {
  if (app.config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true) {
    return createMediaModerationInspectionUrl(app.config, asset.id);
  }

  if (!app.config.MODERATION_MEDIA_BASE_URL || !asset.grant) {
    throw new Error("A moderation media grant is required for legacy manual review.");
  }

  return new URL(`/api/moderation-media/${asset.grant.token}`, app.config.MODERATION_MEDIA_BASE_URL).toString();
}

export async function moderatePendingMediaAsset(
  app: FastifyInstance,
  request: FastifyRequest,
  asset: PendingMediaAsset,
  input: {
    filename?: string;
    moderationSurface: "profile_photo" | "direct_message" | "group_message";
  }
): Promise<ApprovedMediaCandidate> {
  try {
    const accessBanIdentity = severeAccessBanIdentity(app.config, request);
    const photoDnaResult: PhotoDnaResult = shouldBypassPhotoDnaForLaunchUploads(app)
      ? { status: "not_configured" }
      : await checkPhotoDnaForUploadOrReject(app, {
          userId: asset.ownerUserId,
          surface: input.moderationSurface,
          imageBytes: asset.canonicalBytes,
          mimeType: asset.mimeType,
          sourceRoute: asset.surface === "profile_photo" ? "/api/profile-photos" : "/api/messages/photos",
          requestIp: request.ip,
          userAgent: request.headers["user-agent"],
          severeAccessBanIdentity: accessBanIdentity,
          contentId: asset.id,
          contentRef: {
            assetId: asset.id,
            surface: asset.surface
          }
        });
    const provider = createModerationProvider(app.config);
    const bridgeEnabled = app.config.STREAM_IMAGE_BRIDGE_ENABLED === true;
    const signedInspectionEnabled = app.config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true;

    if (bridgeEnabled && !signedInspectionEnabled && !asset.grant) {
      throw new Error("Stream image moderation grant was not created.");
    }

    const moderation = await moderateImageOrReject(app, {
      userId: asset.ownerUserId,
      surface: input.moderationSurface,
      mimeType: asset.mimeType,
      filename: bridgeEnabled ? undefined : input.filename,
      imageUrl: bridgeEnabled ? moderationMediaUrl(app, asset) : undefined,
      contentId: asset.id,
      contentRef: {
        assetId: asset.id,
        surface: asset.surface,
        photoDnaStatus: photoDnaResult.status
      },
      bytes: asset.canonicalBytes,
      severeAccessBanIdentity: accessBanIdentity
    });

    if (bridgeEnabled && !signedInspectionEnabled && asset.grant) {
      const redeemed = await wasModerationMediaGrantRedeemed(app.db, asset.grant.id);

      if (!redeemed) {
        throw new ApiError(503, "MODERATION_UNAVAILABLE", "Image moderation is temporarily unavailable.");
      }

      await deleteModerationMediaGrant(app.db, asset.grant.id);
    }

    return {
      ...asset,
      moderation: {
        provider: moderation.providerResult.provider,
        providerVersion: provider.version,
        providerRequestId: moderation.providerResult.provider_request_id,
        labels: moderation.providerResult.labels,
        decision: moderation.decision,
        rawResult: moderation.providerResult.raw_result ?? {},
        photoDnaStatus: photoDnaResult.status,
        photoDnaProviderRequestId: photoDnaResult.providerRequestId ?? null
      }
    };
  } catch (error) {
    await deletePendingMediaAsset(app, request, asset);
    throw error;
  }
}

export async function removeOwnedNonPublicMediaAsset(
  app: FastifyInstance,
  request: FastifyRequest,
  assetId: string,
  ownerUserId: string
) {
  const result = await app.db.query<{ object_key: string }>(
    `with deleted_media as (
       update media_objects
       set deleted_at = now()
       where id = $1
         and owner_user_id = $2
         and moderation_status in ('pending', 'rejected', 'failed', 'approved_explicit')
         and deleted_at is null
       returning object_key
     ), deleted_variants as (
       update media_variants variant
       set deleted_at = now()
       from deleted_media
       where variant.media_object_id = $1
         and variant.deleted_at is null
       returning variant.object_key
     )
     select object_key from deleted_media
     union all
     select object_key from deleted_variants`,
    [assetId, ownerUserId]
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "Media not found.");
  }

  await deleteObjectsBestEffort(app, request, assetId, result.rows.map((row) => row.object_key));
}
