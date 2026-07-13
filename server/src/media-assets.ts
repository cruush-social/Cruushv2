import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";
import { encryptMediaBytes } from "./media-encryption.js";
import type { ProcessedImage } from "./media-image.js";
import {
  deleteEncryptedMediaObject,
  writeEncryptedMediaObject
} from "./media-storage.js";
import { createModerationProvider } from "./moderation-provider.js";
import { moderateImageOrReject } from "./moderation-service.js";
import type { PolicyDecision, ProviderModerationResult } from "./moderation-types.js";
import { checkPhotoDna } from "./photodna.js";

export type MediaSurface = "profile_photo" | "message_photo";
export type MediaModerationStatus = "pending" | "approved" | "approved_explicit" | "rejected" | "failed";

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

async function deleteObjectsBestEffort(app: FastifyInstance, request: FastifyRequest, assetId: string, objectKeys: string[]) {
  await Promise.all(objectKeys.map(async (objectKey) => {
    try {
      await deleteEncryptedMediaObject(app.config, objectKey);
    } catch (error) {
      request.log.error({ err: error, assetId, stage: "media_cleanup" }, "media object cleanup failed");
    }
  }));
}

async function setMediaStatus(
  app: FastifyInstance,
  assetId: string,
  status: Exclude<MediaModerationStatus, "approved">,
  input: {
    provider?: string | null;
    providerVersion?: string | null;
    labels?: ProviderModerationResult["labels"];
    explicitClassification?: "unknown" | "non_explicit" | "explicit" | "uncertain";
    failureReason?: string | null;
    photoDnaStatus?: string | null;
    photoDnaProviderRequestId?: string | null;
  } = {}
) {
  await app.db.query(
    `update media_objects media
     set moderation_status = $2,
         moderation_provider = coalesce($3, media.moderation_provider),
         moderation_provider_version = coalesce($4, media.moderation_provider_version),
         moderation_scores = $5::jsonb,
         moderation_decided_at = now(),
         moderation_failure_reason = $6,
         explicit_classification = $7,
         photodna_status = coalesce($8, media.photodna_status),
         photodna_provider_request_id = coalesce($9, media.photodna_provider_request_id),
         content_review_id = coalesce((
           select review.id
           from content_reviews review
           where review.content_id = media.id::text
           order by review.created_at desc
           limit 1
         ), media.content_review_id)
     where media.id = $1
       and media.moderation_status = 'pending'`,
    [
      assetId,
      status,
      input.provider ?? null,
      input.providerVersion ?? null,
      JSON.stringify(input.labels ?? []),
      input.failureReason ?? null,
      input.explicitClassification ?? "unknown",
      input.photoDnaStatus ?? null,
      input.photoDnaProviderRequestId ?? null
    ]
  );
}

export async function createPendingMediaAsset(
  app: FastifyInstance,
  request: FastifyRequest,
  input: {
    ownerUserId: string;
    surface: MediaSurface;
    originalBytes: Buffer;
    processed: ProcessedImage;
  }
): Promise<PendingMediaAsset> {
  const id = randomUUID();
  const originalObjectKey = `originals/${id}.enc`;
  const originalEncrypted = encryptMediaBytes(app.config, input.originalBytes);
  const storedObjectKeys: string[] = [];

  try {
    await writeEncryptedMediaObject(app.config, originalObjectKey, originalEncrypted.ciphertext);
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
        input.originalBytes.length,
        input.processed.width,
        input.processed.height,
        originalEncrypted.encryptedDataKey,
        originalEncrypted.dataKeyNonce,
        originalEncrypted.dataKeyAuthTag,
        originalEncrypted.nonce,
        originalEncrypted.authTag,
        originalEncrypted.keyVersion,
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

    return {
      id,
      ownerUserId: input.ownerUserId,
      surface: input.surface,
      mimeType: input.processed.detectedMimeType,
      width: input.processed.width,
      height: input.processed.height,
      byteSize: input.originalBytes.length,
      displayUrl: assetUrl(id, "display"),
      thumbnailUrl: assetUrl(id, "thumbnail")
    };
  } catch (error) {
    await deleteObjectsBestEffort(app, request, id, storedObjectKeys);
    request.log.error({ err: error, assetId: id, stage: "media_ingestion" }, "media ingestion failed");
    throw new ApiError(500, "INTERNAL_ERROR", "Unable to process this image right now.");
  }
}

function hasExplicitLabel(labels: ProviderModerationResult["labels"]) {
  return labels.some((label) => (
    label.normalized_label === "adult_nudity" ||
    label.normalized_label === "adult_explicit"
  ));
}

export async function moderatePendingMediaAsset(
  app: FastifyInstance,
  asset: PendingMediaAsset,
  input: {
    bytes: Buffer;
    filename?: string;
    moderationSurface: "profile_photo" | "direct_message" | "group_message";
  }
): Promise<ApprovedMediaCandidate> {
  const provider = createModerationProvider(app.config);
  let photoDnaResult;

  try {
    photoDnaResult = await checkPhotoDna(app.config, input.bytes);
  } catch {
    await setMediaStatus(app, asset.id, "failed", {
      provider: "photodna",
      explicitClassification: "uncertain",
      failureReason: "photodna_unavailable"
    });
    throw new ApiError(503, "MODERATION_UNAVAILABLE", "Image moderation is temporarily unavailable.");
  }

  if (photoDnaResult.status === "blocked") {
    await setMediaStatus(app, asset.id, "rejected", {
      provider: "photodna",
      explicitClassification: "unknown",
      failureReason: "photodna_match",
      photoDnaStatus: photoDnaResult.status,
      photoDnaProviderRequestId: photoDnaResult.providerRequestId ?? null
    });
    throw new ApiError(400, "CONTENT_REJECTED", "This photo violates Cruush safety rules and cannot be saved.");
  }

  let moderation;

  try {
    moderation = await moderateImageOrReject(app, {
      userId: asset.ownerUserId,
      surface: input.moderationSurface,
      mimeType: asset.mimeType,
      filename: input.filename,
      contentId: asset.id,
      contentRef: {
        assetId: asset.id,
        surface: asset.surface,
        photoDnaStatus: photoDnaResult.status
      },
      bytes: input.bytes
    });
  } catch (error) {
    const rejected = error instanceof ApiError && error.code === "CONTENT_REJECTED";
    await setMediaStatus(app, asset.id, rejected ? "rejected" : "failed", {
      provider: provider.name,
      providerVersion: provider.version,
      explicitClassification: rejected ? "unknown" : "uncertain",
      failureReason: rejected ? "policy_rejected" : "provider_unavailable",
      photoDnaStatus: photoDnaResult.status,
      photoDnaProviderRequestId: photoDnaResult.providerRequestId ?? null
    });
    throw error;
  }

  if (hasExplicitLabel(moderation.providerResult.labels)) {
    await setMediaStatus(app, asset.id, "approved_explicit", {
      provider: moderation.providerResult.provider,
      providerVersion: provider.version,
      labels: moderation.providerResult.labels,
      explicitClassification: "explicit",
      photoDnaStatus: photoDnaResult.status,
      photoDnaProviderRequestId: photoDnaResult.providerRequestId ?? null
    });
    throw new ApiError(400, "CONTENT_REJECTED", "This photo cannot be displayed without explicit-content controls.");
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
