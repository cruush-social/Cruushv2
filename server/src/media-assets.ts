import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { checkPhotoDnaForUploadOrReject } from "./csam-reporting.js";
import { ApiError } from "./errors.js";
import { encryptMediaBytes } from "./media-encryption.js";
import type { ProcessedImage } from "./media-image.js";
import { createMediaModerationInspectionUrl } from "./media-moderation-url.js";
import { activeAlphaPhotoUploadBypass } from "./photo-upload-availability.js";
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
import {
  moderationRejectionFromError,
  moderateImageOrReject,
  providerResultFromModerationUnavailableError
} from "./moderation-service.js";
import type { PolicyDecision, ProviderModerationResult } from "./moderation-types.js";
import type { PhotoDnaResult } from "./photodna.js";
import { severeAccessBanIdentity } from "./severe-access-bans.js";

export type MediaSurface = "profile_photo" | "message_photo" | "feed_photo";

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
  providerTaskId?: string;
};

export function isPhotoModerationUnavailable(error: unknown) {
  return error instanceof ApiError && error.code === "MODERATION_UNAVAILABLE";
}

const retainedModerationEvidenceErrors = new WeakSet<object>();

export function isModerationEvidenceRetained(error: unknown) {
  return typeof error === "object" && error !== null && retainedModerationEvidenceErrors.has(error);
}

async function retainRejectedProfilePhotoEvidence(
  app: FastifyInstance,
  request: FastifyRequest,
  asset: PendingMediaAsset,
  rejection: NonNullable<ReturnType<typeof moderationRejectionFromError>>
) {
  const retained = await app.db.query<{ id: string }>(
    `update media_objects
     set moderation_status = 'rejected',
         moderation_provider = $4,
         moderation_scores = $5::jsonb,
         moderation_decided_at = now(),
         moderation_failure_reason = null,
         moderation_hold = null,
         content_review_id = $3,
         public_url = null
     where id = $1
       and owner_user_id = $2
       and surface = 'profile_photo'
       and moderation_status = 'pending'
       and deleted_at is null
     returning id::text as id`,
    [
      asset.id,
      asset.ownerUserId,
      rejection.contentReviewId,
      rejection.providerResult.provider,
      JSON.stringify(rejection.providerResult.labels)
    ]
  );

  if (!retained.rows[0]?.id) {
    throw new Error("Rejected profile photo evidence could not be linked to its moderation review.");
  }

  if (asset.grant) {
    try {
      await deleteModerationMediaGrant(app.db, asset.grant.id);
    } catch (error) {
      request.log.warn({ err: error, assetId: asset.id, stage: "moderation_evidence_grant_cleanup" }, "moderation evidence grant cleanup failed");
    }
  }
}

export async function retainPendingMediaAssetForRetry(
  app: FastifyInstance,
  request: FastifyRequest,
  asset: PendingMediaAsset,
  providerResult?: ProviderModerationResult
) {
  const taskState = streamTaskState(providerResult);

  try {
    await app.db.query(
      `update media_objects
       set moderation_failure_reason = 'provider_unavailable',
           moderation_attempts = moderation_attempts + 1,
           moderation_next_retry_at = now() + (least(300, power(2, moderation_attempts + 1)) * interval '1 second'),
           moderation_hold = case
             when $3::boolean then coalesce(moderation_hold, '{}'::jsonb) - 'streamModerationTaskId'
             when $4::text is not null then coalesce(moderation_hold, '{}'::jsonb) || jsonb_build_object('streamModerationTaskId', $4::text)
             else moderation_hold
           end
       where id = $1
         and owner_user_id = $2
         and moderation_status = 'pending'
         and deleted_at is null`,
      [asset.id, asset.ownerUserId, taskState.terminal, taskState.taskId]
    );
  } catch (error) {
    request.log.error({ err: error, assetId: asset.id, stage: "moderation_retry_hold" }, "could not retain photo for moderation retry");
    throw error;
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function streamTaskState(providerResult: ProviderModerationResult | undefined) {
  const raw = providerResult?.raw_result;
  const candidates = [
    raw,
    recordFromUnknown(raw?.stream),
    recordFromUnknown(raw?.primary),
    recordFromUnknown(raw?.provider_result)
  ].filter((candidate): candidate is Record<string, unknown> => candidate !== null && candidate !== undefined);
  const terminal = candidates.some((candidate) => candidate.async_task_terminal === true);
  const taskId = terminal
    ? null
    : candidates.map((candidate) => candidate.task_id).find((value): value is string => typeof value === "string" && value.length > 0) ?? null;

  return { taskId, terminal };
}

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
  if (deployedSafetyReadyBeforePhotoDna(app)) {
    return true;
  }

  return activeAlphaPhotoUploadBypass(app.config);
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
      // A failed upload can lose its account FK race during deletion. Retain
      // its object key for retry even when no media metadata row survived.
      try {
        await app.db.query(
          `insert into account_deletion_media_cleanup (object_key) values ($1)
           on conflict (object_key) do update set completed_at = null, next_attempt_at = now()`,
          [objectKey]
        );
      } catch {
        request.log.error({ stage: "media_cleanup_retry" }, "media object cleanup could not be queued");
      }
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
    moderationHold?: Record<string, unknown>;
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
           explicit_classification,
           moderation_hold
         ) values (
           $1, $2, $3, $4, null, 'image', $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, 'pending', 'unknown', $37::jsonb
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
        (input.processed.canonicalMimeType ?? input.processed.detectedMimeType),
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
        display.encrypted.keyVersion,
        input.moderationHold ? JSON.stringify(input.moderationHold) : null
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
          mimeType: (input.processed.canonicalMimeType ?? input.processed.detectedMimeType),
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
      mimeType: (input.processed.canonicalMimeType ?? input.processed.detectedMimeType),
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

function usesSignedInspectionUrl(app: FastifyInstance, asset: PendingMediaAsset) {
  return app.config.STREAM_IMAGE_BRIDGE_ENABLED === true &&
    (
      app.config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true ||
      asset.surface === "message_photo" ||
      asset.surface === "feed_photo"
    );
}

function moderationMediaUrl(app: FastifyInstance, asset: PendingMediaAsset) {
  if (usesSignedInspectionUrl(app, asset)) {
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
          sourceRoute: asset.surface === "profile_photo"
            ? "/api/profile-photos"
            : asset.surface === "feed_photo"
              ? "/api/feed/photos"
              : "/api/messages/photos",
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
    const signedInspectionEnabled = usesSignedInspectionUrl(app, asset);
    const alphaPhotoUploadBypass = activeAlphaPhotoUploadBypass(app.config);
    const useStreamImageUrl = bridgeEnabled && (signedInspectionEnabled || Boolean(asset.grant));

    if (bridgeEnabled && !signedInspectionEnabled && !asset.grant && !alphaPhotoUploadBypass) {
      throw new Error("Stream image moderation grant was not created.");
    }

    request.log.info({
      assetId: asset.id,
      surface: input.moderationSurface,
      provider: provider.name,
      streamModerationEnabled: app.config.STREAM_MODERATION_ENABLED,
      streamImageBridgeEnabled: bridgeEnabled,
      signedInspectionEnabled,
      mediaPublicBaseUrlConfigured: Boolean(app.config.MEDIA_PUBLIC_BASE_URL),
      photoDnaStatus: photoDnaResult.status,
      stage: "image_moderation_attempt"
    }, "image moderation attempt");

    let moderation: Awaited<ReturnType<typeof moderateImageOrReject>>;

    try {
      moderation = await moderateImageOrReject(app, {
        userId: asset.ownerUserId,
        surface: input.moderationSurface,
        mimeType: asset.mimeType,
        filename: useStreamImageUrl ? undefined : input.filename,
        imageUrl: useStreamImageUrl ? moderationMediaUrl(app, asset) : undefined,
        contentId: asset.id,
        providerTaskId: asset.providerTaskId,
        contentRef: {
          assetId: asset.id,
          surface: asset.surface,
          photoDnaStatus: photoDnaResult.status
        },
        bytes: asset.canonicalBytes,
        severeAccessBanIdentity: accessBanIdentity
      });
    } catch (error) {
      request.log.error({
        err: error,
        assetId: asset.id,
        surface: input.moderationSurface,
        provider: provider.name,
        streamModerationEnabled: app.config.STREAM_MODERATION_ENABLED,
        streamImageBridgeEnabled: bridgeEnabled,
        signedInspectionEnabled,
        stage: "image_moderation_failed"
      }, "image moderation failed");
      throw error;
    }

    request.log.info({
      assetId: asset.id,
      surface: input.moderationSurface,
      provider: moderation.providerResult.provider,
      providerRequestId: moderation.providerResult.provider_request_id,
      providerStatus: moderation.providerResult.status,
      recommendedAction: moderation.providerResult.recommended_action,
      decision: moderation.decision.decision,
      reasonCode: moderation.decision.reason_code,
      labelCount: moderation.providerResult.labels.length,
      stage: "image_moderation_result"
    }, "image moderation result");

    if (useStreamImageUrl && !signedInspectionEnabled && asset.grant) {
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
    if (isPhotoModerationUnavailable(error)) {
      try {
        await retainPendingMediaAssetForRetry(
          app,
          request,
          asset,
          providerResultFromModerationUnavailableError(error)
        );
      } catch (retentionError) {
        request.log.error({ err: retentionError, assetId: asset.id, stage: "moderation_retry_hold" }, "photo retry hold update failed");
      }
    } else {
      const rejection = moderationRejectionFromError(error);
      if (asset.surface === "profile_photo" && rejection?.decision.reason_code === "minor_face_detected") {
        let evidenceRetained = false;
        try {
          await retainRejectedProfilePhotoEvidence(app, request, asset, rejection);
          evidenceRetained = true;
        } catch (retentionError) {
          request.log.error({ err: retentionError, assetId: asset.id, stage: "moderation_evidence_retention" }, "moderation evidence retention failed");
        }
        if (evidenceRetained) {
          retainedModerationEvidenceErrors.add(rejection);
          throw rejection;
        }
      }
      await deletePendingMediaAsset(app, request, asset);
    }
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
         and (
           moderation_status in ('pending', 'rejected', 'failed', 'approved_explicit')
           or (
             surface = 'feed_photo'
             and moderation_status = 'approved'
             and not exists (
               select 1
               from feed_post_attachments attachment
               where attachment.media_object_id = media_objects.id
             )
           )
         )
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
