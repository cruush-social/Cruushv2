import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { assertCanSendNsfwMessagePhoto } from "./cruush-match-settings.js";
import { decryptMediaBytes } from "./media-encryption.js";
import { recordMeaningfulActivitySafely } from "./rewards-service.js";
import {
  deletePendingMediaAsset,
  isPhotoModerationUnavailable,
  moderatePendingMediaAsset,
  type ApprovedMediaCandidate,
  type PendingMediaAsset
} from "./media-assets.js";
import {
  assertCanSaveFavoriteMessageImage,
  notifyConversationMessageRecipients
} from "./routes/messages.js";
import { sendApprovedPhotoMessage } from "./message-photo-send.js";
import { readEncryptedMediaObject } from "./media-storage.js";
import { runTransaction } from "./db.js";
import { userHasOwnerFullAccess } from "./owner-access.js";
import { ApiError } from "./errors.js";

const RETRY_CLAIM_MS = 5 * 60 * 1000;
const MAX_RETRY_BATCH = 25;
const MAX_PROFILE_PHOTOS = 4;

type PendingPhotoRow = {
  id: string;
  owner_user_id: string;
  surface: "profile_photo" | "message_photo";
  object_key: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  encrypted_data_key: string;
  data_key_nonce: string;
  data_key_auth_tag: string;
  content_nonce: string;
  content_auth_tag: string;
  key_version: string;
  moderation_hold: Record<string, unknown> | null;
  variant_keys: string[];
};

type RetryRequest = FastifyRequest;

function retryRequest(app: FastifyInstance) {
  return {
    ip: "photo-moderation-retry",
    headers: {},
    log: app.log
  } as unknown as RetryRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value) {
    throw new ApiError(500, "INTERNAL_ERROR", `Pending photo is missing ${name}.`);
  }

  return value;
}

function requiredBoolean(value: unknown, name: string) {
  if (typeof value !== "boolean") {
    throw new ApiError(500, "INTERNAL_ERROR", `Pending photo is missing ${name}.`);
  }

  return value;
}

async function claimPendingPhotos(app: FastifyInstance, limit: number) {
  const result = await app.db.query<PendingPhotoRow>(
    `with candidates as (
       select media.id
       from media_objects media
       where media.moderation_status = 'pending'
         and media.moderation_failure_reason = 'provider_unavailable'
         and media.moderation_next_retry_at <= now()
         and media.deleted_at is null
         and media.surface in ('profile_photo', 'message_photo')
       order by media.moderation_next_retry_at asc, media.created_at asc
       limit $1
       for update skip locked
     )
     update media_objects media
     set moderation_next_retry_at = now() + ($2 * interval '1 millisecond')
     from candidates
     where media.id = candidates.id
     returning
       media.id,
       media.owner_user_id,
       media.surface,
       media.object_key,
       media.mime_type,
       media.byte_size,
       media.width,
       media.height,
       media.encrypted_data_key,
       media.data_key_nonce,
       media.data_key_auth_tag,
       media.content_nonce,
       media.content_auth_tag,
       media.key_version,
       media.moderation_hold,
       coalesce((
         select array_agg(variant.object_key order by variant.variant_type)
         from media_variants variant
         where variant.media_object_id = media.id
           and variant.deleted_at is null
       ), '{}'::text[]) as variant_keys`,
    [Math.min(limit, MAX_RETRY_BATCH), RETRY_CLAIM_MS]
  );

  return result.rows;
}

async function toPendingAsset(app: FastifyInstance, row: PendingPhotoRow): Promise<PendingMediaAsset> {
  if (!row.width || !row.height || row.width < 1 || row.height < 1) {
    throw new ApiError(500, "INTERNAL_ERROR", "Pending photo has invalid dimensions.");
  }

  const encryptedBytes = await readEncryptedMediaObject(app.config, row.object_key);
  const canonicalBytes = decryptMediaBytes(app.config, {
    ciphertext: encryptedBytes,
    nonce: row.content_nonce,
    authTag: row.content_auth_tag,
    encryptedDataKey: row.encrypted_data_key,
    dataKeyNonce: row.data_key_nonce,
    dataKeyAuthTag: row.data_key_auth_tag,
    keyVersion: row.key_version
  });

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    surface: row.surface,
    mimeType: row.mime_type as PendingMediaAsset["mimeType"],
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    displayUrl: `/api/media/assets/${row.id}/display`,
    thumbnailUrl: `/api/media/assets/${row.id}/thumbnail`,
    canonicalBytes,
    objectKeys: [row.object_key, ...row.variant_keys]
  };
}

function moderationValues(candidate: ApprovedMediaCandidate) {
  const isAdultExplicit = candidate.moderation.labels.some((label) =>
    label.normalized_label === "adult_nudity" || label.normalized_label === "adult_explicit"
  );

  return { isAdultExplicit, labels: JSON.stringify(candidate.moderation.labels) };
}

async function approveProfilePhoto(app: FastifyInstance, candidate: ApprovedMediaCandidate) {
  const { isAdultExplicit } = moderationValues(candidate);
  const ownerFullAccess = await userHasOwnerFullAccess(app, candidate.ownerUserId);

  await runTransaction(app.db, async (db) => {
    const current = await db.query<{ photos: string[]; allowed: boolean }>(
      `select
         coalesce(profile.photos, '{}'::text[]) as photos,
         (
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
         ) as allowed
       from app_users app_user
       left join profiles profile on profile.id = app_user.id
       left join user_trust_profiles trust on trust.user_id = app_user.id
       where app_user.id = $1
       for update of app_user`,
      [candidate.ownerUserId, ownerFullAccess]
    );
    const state = current.rows[0];

    if (!state || !state.allowed) {
      throw new ApiError(403, "FEATURE_RESTRICTED", "Photo uploads are unavailable for this account.");
    }
    if (state.photos.length >= MAX_PROFILE_PHOTOS) {
      throw new ApiError(400, "VALIDATION_ERROR", `You can add up to ${MAX_PROFILE_PHOTOS} photos.`);
    }

    const reviewId = randomUUID();
    await db.query(
      `insert into content_reviews (
         id, user_id, surface, content_type, status, content_id, content_ref,
         provider, provider_request_id, normalized_labels, policy_decision,
         moderation_status, moderation_provider, moderation_raw_result, completed_at
       ) values ($1, $2, 'profile_photo', 'image', 'allowed', $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, 'allowed', $5, $9::jsonb, now())`,
      [
        reviewId,
        candidate.ownerUserId,
        candidate.id,
        JSON.stringify({ assetId: candidate.id, surface: "profile_photo" }),
        candidate.moderation.provider,
        candidate.moderation.providerRequestId,
        JSON.stringify(candidate.moderation.labels),
        JSON.stringify(candidate.moderation.decision),
        JSON.stringify(candidate.moderation.rawResult)
      ]
    );

    const approved = await db.query<{ id: string }>(
      `update media_objects
       set public_url = $2,
           moderation_status = 'approved',
           moderation_provider = $3,
           moderation_provider_version = $4,
           moderation_scores = $5::jsonb,
           moderation_decided_at = now(),
           moderation_failure_reason = null,
           moderation_attempts = 0,
           moderation_next_retry_at = null,
           moderation_hold = null,
           explicit_classification = case when $6 then 'explicit' else 'non_explicit' end,
           photodna_status = $7,
           photodna_provider_request_id = $8,
           content_review_id = $9
       where id = $1
         and owner_user_id = $10
         and surface = 'profile_photo'
         and moderation_status = 'pending'
         and deleted_at is null
       returning id::text as id`,
      [
        candidate.id,
        candidate.displayUrl,
        candidate.moderation.provider,
        candidate.moderation.providerVersion,
        JSON.stringify(candidate.moderation.labels),
        isAdultExplicit,
        candidate.moderation.photoDnaStatus,
        candidate.moderation.photoDnaProviderRequestId,
        reviewId,
        candidate.ownerUserId
      ]
    );

    if (!approved.rows[0]) {
      throw new ApiError(500, "INTERNAL_ERROR", "The pending profile photo could not be approved.");
    }

    await db.query(
      `insert into profiles (id, photos, updated_at)
       values ($1, array[$2]::text[], now())
       on conflict (id) do update
       set photos = case
         when array_position(profiles.photos, $2) is not null then profiles.photos
         else array_append(profiles.photos, $2)
       end,
       updated_at = now()`,
      [candidate.ownerUserId, candidate.displayUrl]
    );
  });
}

async function approveFavoriteImage(
  app: FastifyInstance,
  candidate: ApprovedMediaCandidate,
  hold: Record<string, unknown>
) {
  const label = typeof hold.label === "string" ? hold.label.trim() : "";
  const ownerFullAccess = await userHasOwnerFullAccess(app, candidate.ownerUserId);
  await assertCanSaveFavoriteMessageImage(app, candidate.ownerUserId, ownerFullAccess);
  const { isAdultExplicit } = moderationValues(candidate);

  await runTransaction(app.db, async (db) => {
    const reviewId = randomUUID();
    await db.query(
      `insert into content_reviews (
         id, user_id, surface, content_type, status, content_id, content_ref,
         provider, provider_request_id, normalized_labels, policy_decision,
         moderation_status, moderation_provider, moderation_raw_result, completed_at
       ) values ($1, $2, 'direct_message', 'image', 'allowed', $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, 'allowed', $5, $9::jsonb, now())`,
      [
        reviewId,
        candidate.ownerUserId,
        candidate.id,
        JSON.stringify({ assetId: candidate.id, surface: "message_photo", favorite: true }),
        candidate.moderation.provider,
        candidate.moderation.providerRequestId,
        JSON.stringify(candidate.moderation.labels),
        JSON.stringify(candidate.moderation.decision),
        JSON.stringify(candidate.moderation.rawResult)
      ]
    );

    const approved = await db.query<{ id: string }>(
      `update media_objects
       set public_url = $2,
           moderation_status = 'approved',
           moderation_provider = $3,
           moderation_provider_version = $4,
           moderation_scores = $5::jsonb,
           moderation_decided_at = now(),
           moderation_failure_reason = null,
           moderation_attempts = 0,
           moderation_next_retry_at = null,
           moderation_hold = null,
           explicit_classification = case when $6 then 'explicit' else 'non_explicit' end,
           photodna_status = $7,
           photodna_provider_request_id = $8,
           content_review_id = $9
       where id = $1
         and owner_user_id = $10
         and surface = 'message_photo'
         and moderation_status = 'pending'
         and deleted_at is null
       returning id::text as id`,
      [
        candidate.id,
        candidate.displayUrl,
        candidate.moderation.provider,
        candidate.moderation.providerVersion,
        JSON.stringify(candidate.moderation.labels),
        isAdultExplicit,
        candidate.moderation.photoDnaStatus,
        candidate.moderation.photoDnaProviderRequestId,
        reviewId,
        candidate.ownerUserId
      ]
    );

    if (!approved.rows[0]) {
      throw new ApiError(500, "INTERNAL_ERROR", "The pending favorite image could not be approved.");
    }

    await db.query(
      `insert into message_favorite_images (user_id, media_object_id, label)
       values ($1, $2, $3)
       on conflict (user_id, media_object_id) do update
       set label = excluded.label, updated_at = now()`,
      [candidate.ownerUserId, candidate.id, label]
    );
  });
}

async function approveMessagePhoto(
  app: FastifyInstance,
  request: RetryRequest,
  candidate: ApprovedMediaCandidate,
  hold: Record<string, unknown>
) {
  const conversationId = requiredString(hold.conversationId, "conversationId");
  const content = hold.content;
  if (!isRecord(content)) {
    throw new ApiError(500, "INTERNAL_ERROR", "Pending photo is missing encrypted content.");
  }

  const viewOnce = requiredBoolean(hold.viewOnce, "viewOnce");
  const disappearingTimer = requiredString(hold.disappearingTimer, "disappearingTimer");
  const restrictedFeature = requiredString(hold.restrictedFeature, "restrictedFeature") as "direct_messages" | "group_messages";
  const moderationSurface = requiredString(hold.moderationSurface, "moderationSurface") as "direct_message" | "group_message";
  const ownerFullAccess = requiredBoolean(hold.ownerFullAccess, "ownerFullAccess");
  const { isAdultExplicit } = moderationValues(candidate);

  if (isAdultExplicit) {
    await assertCanSendNsfwMessagePhoto(app, { conversationId, senderUserId: candidate.ownerUserId });
  }

  const created = await sendApprovedPhotoMessage(app, request, {
    conversationId,
    senderUserId: candidate.ownerUserId,
    mediaObjectId: candidate.id,
    displayUrl: candidate.displayUrl,
    content: {
      ciphertext: requiredString(content.ciphertext, "content.ciphertext"),
      nonce: requiredString(content.nonce, "content.nonce"),
      authTag: requiredString(content.authTag, "content.authTag"),
      keyVersion: requiredString(content.keyVersion, "content.keyVersion")
    },
    moderation: candidate.moderation,
    isAdultExplicit,
    viewOnce,
    disappearingTimer,
    restrictedFeature,
    moderationSurface,
    ownerFullAccess
  });

  try {
    await recordMeaningfulActivitySafely(app, {
      userId: candidate.ownerUserId,
      activityType: "message",
      sourceEventId: created.id
    });
  } catch (error) {
    app.log.warn({ err: error, messageId: created.id }, "pending photo message activity dispatch failed");
  }

  try {
    const conversation = await app.db.query<{ kind: "dm" | "group"; title: string | null }>(
      "select kind, title from conversations where id = $1::uuid limit 1",
      [conversationId]
    );
    const conversationRow = conversation.rows[0];
    if (conversationRow) {
      await notifyConversationMessageRecipients(app, {
        conversationId,
        senderUserId: candidate.ownerUserId,
        messageId: created.id,
        conversationKind: conversationRow.kind,
        conversationTitle: conversationRow.title
      });
    }
  } catch (error) {
    app.log.warn({ err: error, messageId: created.id }, "pending photo message notification lookup failed");
  }
}

async function processPendingPhoto(app: FastifyInstance, row: PendingPhotoRow) {
  const request = retryRequest(app);
  const asset = await toPendingAsset(app, row);
  const hold = isRecord(row.moderation_hold) ? row.moderation_hold : {};
  const moderationSurface = hold.moderationSurface === "group_message"
    ? "group_message"
    : row.surface === "profile_photo" ? "profile_photo" : "direct_message";
  const candidate = await moderatePendingMediaAsset(app, request, asset, {
    moderationSurface
  });

  switch (hold.kind) {
    case "profile_photo":
      await approveProfilePhoto(app, candidate);
      return;
    case "favorite_image":
      await approveFavoriteImage(app, candidate, hold);
      return;
    case "message_photo":
      await approveMessagePhoto(app, request, candidate, hold);
      return;
    default:
      throw new ApiError(500, "INTERNAL_ERROR", "Pending photo has unknown moderation hold.");
  }
}

export async function recheckPendingPhotoModerations(app: FastifyInstance, limit = MAX_RETRY_BATCH) {
  const rows = await claimPendingPhotos(app, limit);
  let completed = 0;

  for (const row of rows) {
    try {
      await processPendingPhoto(app, row);
      completed += 1;
    } catch (error) {
      if (isPhotoModerationUnavailable(error)) {
        app.log.warn({ err: error, assetId: row.id, stage: "photo_moderation_retry" }, "photo moderation still unavailable");
        continue;
      }

      app.log.error({ err: error, assetId: row.id, stage: "photo_moderation_retry" }, "pending photo retry failed");
      try {
        await deletePendingMediaAsset(app, retryRequest(app), await toPendingAsset(app, row));
      } catch (cleanupError) {
        app.log.error({ err: cleanupError, assetId: row.id, stage: "photo_moderation_retry_cleanup" }, "failed to clean up invalid pending photo");
      }
    }
  }

  return { scanned: rows.length, completed };
}

export function startPendingPhotoModerationRetryScheduler(app: FastifyInstance) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await recheckPendingPhotoModerations(app);
    } catch (error) {
      app.log.error({ err: error, stage: "photo_moderation_retry_batch" }, "pending photo retry batch failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void run(), 30_000);
  timer.unref();
  void run();

  return () => clearInterval(timer);
}
