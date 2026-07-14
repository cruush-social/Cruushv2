import { createHmac, randomUUID } from "node:crypto";
import type { AppConfig } from "./config.js";
import { runTransaction, type DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import { deleteEncryptedMediaObject } from "./media-storage.js";
import type { PolicyDecision, ProviderModerationResult } from "./moderation-types.js";

export const BANK_PROFILE_PHOTO_REVIEW_TTL_MS = 30 * 60 * 1000;

type PendingProfilePhotoReviewInput = {
  ownerUserId: string;
  mediaId: string;
  objectKey: string;
  publicUrl: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  encryptedDataKey: string;
  dataKeyNonce: string;
  dataKeyAuthTag: string;
  contentNonce: string;
  contentAuthTag: string;
  keyVersion: string;
  photoDnaStatus: string;
  photoDnaProviderRequestId: string | null;
  providerResult: ProviderModerationResult;
  decision: PolicyDecision;
};

type ClockOptions = {
  now?: () => Date;
};

export function isBankProfilePhotoManualReviewEligible(config: AppConfig, userId: string) {
  return config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED !== true &&
    config.BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED === true &&
    config.APP_DEPLOYMENT_STAGE === "staging" &&
    config.STREAM_IMAGE_BRIDGE_ENABLED === true &&
    (config.BANK_PROFILE_PHOTO_TESTER_USER_IDS ?? []).includes(userId);
}

export async function createPendingProfilePhotoReview(
  db: DbClient,
  input: PendingProfilePhotoReviewInput,
  options: ClockOptions = {}
) {
  const id = randomUUID();
  const contentReviewId = randomUUID();
  const now = options.now?.() ?? new Date();
  const expiresAt = new Date(now.getTime() + BANK_PROFILE_PHOTO_REVIEW_TTL_MS);
  const contentRef = {
    mediaId: input.mediaId,
    manualReviewId: id,
    mimeType: input.mimeType,
    photoDnaStatus: input.photoDnaStatus
  };

  await db.query(
    `insert into content_reviews (
       id,
       user_id,
       surface,
       content_type,
       status,
       content_id,
       content_ref,
       provider,
       provider_request_id,
       normalized_labels,
       policy_decision,
       moderation_status,
       flagged_reason,
       moderation_provider,
       moderation_raw_result,
       completed_at
     )
     values ($1, $2, 'profile_photo', 'image', 'queued', $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, 'pending_review', $9, $5, $10::jsonb, now())`,
    [
      contentReviewId,
      input.ownerUserId,
      input.mediaId,
      JSON.stringify(contentRef),
      input.providerResult.provider,
      input.providerResult.provider_request_id,
      JSON.stringify(input.providerResult.labels),
      JSON.stringify(input.decision),
      input.decision.reason_code,
      JSON.stringify(input.providerResult.raw_result ?? {})
    ]
  );

  await db.query(
    `insert into profile_photo_manual_reviews (
       id,
       owner_user_id,
       media_id,
       content_review_id,
       object_key,
       public_url,
       mime_type,
       byte_size,
       encrypted_data_key,
       data_key_nonce,
       data_key_auth_tag,
       content_nonce,
       content_auth_tag,
       key_version,
       photodna_status,
       photodna_provider_request_id,
       status,
       expires_at,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending', $17, $18, $18)`,
    [
      id,
      input.ownerUserId,
      input.mediaId,
      contentReviewId,
      input.objectKey,
      input.publicUrl,
      input.mimeType,
      input.byteSize,
      input.encryptedDataKey,
      input.dataKeyNonce,
      input.dataKeyAuthTag,
      input.contentNonce,
      input.contentAuthTag,
      input.keyVersion,
      input.photoDnaStatus,
      input.photoDnaProviderRequestId,
      expiresAt,
      now
    ]
  );

  return {
    id,
    contentReviewId,
    publicUrl: input.publicUrl,
    status: "pending" as const,
    expiresAt
  };
}

type CleanupClaimRow = {
  id: string;
  object_key: string;
  content_review_id: string;
  deletion_outcome: "rejected" | "expired";
};

type CleanupOptions = {
  deleteObject?: typeof deleteEncryptedMediaObject;
};

export async function cleanupExpiredProfilePhotoReviews(
  db: DbClient,
  config: AppConfig,
  limit = 100,
  options: CleanupOptions = {}
) {
  const claimed = await db.query<CleanupClaimRow>(
    `with candidates as (
       select id
       from profile_photo_manual_reviews
       where (
         (status = 'pending' and expires_at <= now())
         or (status = 'deleting' and updated_at <= now() - interval '5 minutes')
       )
         and object_key is not null
         and ciphertext_deleted_at is null
       order by expires_at asc
       for update skip locked
       limit $1
     )
     update profile_photo_manual_reviews review
     set status = 'deleting',
         deletion_outcome = coalesce(review.deletion_outcome, 'expired'),
         updated_at = now()
     from candidates
     where review.id = candidates.id
     returning review.id, review.object_key, review.content_review_id, review.deletion_outcome`,
    [limit]
  );
  const deleteObject = options.deleteObject ?? deleteEncryptedMediaObject;
  let deleted = 0;

  for (const review of claimed.rows) {
    try {
      await deleteObject(config, review.object_key);
      await db.query(
        `update content_reviews
         set status = 'rejected',
             moderation_status = 'blocked',
             flagged_reason = case
               when $2 = 'rejected' then 'manual_review_rejected'
               else 'manual_review_expired'
             end,
             completed_at = now()
         where id = $1`,
        [review.content_review_id, review.deletion_outcome]
      );
      await db.query(
        `update profile_photo_manual_reviews
         set status = coalesce(deletion_outcome, 'expired'),
             object_key = null,
             encrypted_data_key = null,
             data_key_nonce = null,
             data_key_auth_tag = null,
             content_nonce = null,
             content_auth_tag = null,
             key_version = null,
             ciphertext_deleted_at = now(),
             updated_at = now()
         where id = $1
           and status = 'deleting'`,
        [review.id]
      );
      deleted += 1;
    } catch {
      // Keep the deletion claim retryable. The next scheduled cleanup will try again.
    }
  }

  return deleted;
}

type ReviewDecisionOptions = ClockOptions & {
  reviewerReference: string;
  reason?: string;
};

type LockedReviewRow = {
  id: string;
  owner_user_id?: string;
  media_id?: string;
  content_review_id?: string;
  object_key?: string | null;
  public_url: string;
  mime_type?: string;
  byte_size?: number;
  encrypted_data_key?: string | null;
  data_key_nonce?: string | null;
  data_key_auth_tag?: string | null;
  content_nonce?: string | null;
  content_auth_tag?: string | null;
  key_version?: string | null;
  photodna_status?: string;
  photodna_provider_request_id?: string | null;
  status: "pending" | "deleting" | "approved" | "rejected" | "expired";
  expires_at?: string | Date;
};

const lockedReviewSelection = `
  id,
  owner_user_id,
  media_id,
  content_review_id,
  object_key,
  public_url,
  mime_type,
  byte_size,
  encrypted_data_key,
  data_key_nonce,
  data_key_auth_tag,
  content_nonce,
  content_auth_tag,
  key_version,
  photodna_status,
  photodna_provider_request_id,
  status,
  expires_at`;

function assertPendingReviewNotExpired(review: LockedReviewRow, now: Date) {
  if (!review.expires_at || new Date(review.expires_at).getTime() <= now.getTime()) {
    throw new ApiError(409, "VALIDATION_ERROR", "This profile-photo review has expired.");
  }
}

export async function approvePendingProfilePhotoReview(
  db: DbClient,
  reviewId: string,
  options: ReviewDecisionOptions
) {
  const now = options.now?.() ?? new Date();

  return runTransaction(db, async (client) => {
    const locked = await client.query<LockedReviewRow>(
      `select ${lockedReviewSelection}
       from profile_photo_manual_reviews
       where id = $1
       for update`,
      [reviewId]
    );
    const review = locked.rows[0];

    if (!review) {
      throw new ApiError(404, "NOT_FOUND", "Profile-photo review not found.");
    }

    if (review.status === "approved") {
      return { id: review.id, status: "approved" as const, publicUrl: review.public_url };
    }

    if (review.status !== "pending") {
      throw new ApiError(409, "VALIDATION_ERROR", "This profile-photo review has already been decided.");
    }

    assertPendingReviewNotExpired(review, now);

    if (
      !review.owner_user_id ||
      !review.object_key ||
      !review.mime_type ||
      !review.byte_size ||
      !review.encrypted_data_key ||
      !review.data_key_nonce ||
      !review.data_key_auth_tag ||
      !review.content_nonce ||
      !review.content_auth_tag ||
      !review.key_version ||
      !review.content_review_id
    ) {
      throw new ApiError(409, "VALIDATION_ERROR", "This profile-photo review cannot be approved.");
    }

    await client.query(
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
       values ($1, 'profile_photo', $2, $3, 'image', $4, $5, $6, $7, $8, $9, $10, $11, 'allowed', $12, $13)`,
      [
        review.owner_user_id,
        review.object_key,
        review.public_url,
        review.mime_type,
        review.byte_size,
        review.encrypted_data_key,
        review.data_key_nonce,
        review.data_key_auth_tag,
        review.content_nonce,
        review.content_auth_tag,
        review.key_version,
        review.photodna_status ?? "not_configured",
        review.photodna_provider_request_id ?? null
      ]
    );

    const saved = await client.query<{ photos: string[] }>(
      `with eligible_user as (
         select users.id
         from app_users users
         left join user_trust_profiles trust on trust.user_id = users.id
         where users.id = $1
           and coalesce(trust.is_suspended, false) = false
           and coalesce(trust.trust_score, 50) > 20
           and not exists (
             select 1 from suspensions suspension
             where suspension.user_id = users.id
               and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
           )
           and not exists (
             select 1 from feature_restrictions restriction
             where restriction.user_id = users.id
               and restriction.feature = 'photo_uploads'
               and (restriction.ends_at is null or restriction.ends_at > now())
           )
       )
       insert into profiles (id, photos, updated_at)
       select eligible_user.id, array[$2]::text[], now()
       from eligible_user
       on conflict (id) do update
       set photos = case
         when array_position(profiles.photos, $2) is not null then profiles.photos
         else array_append(profiles.photos, $2)
       end,
       updated_at = now()
       where array_position(profiles.photos, $2) is not null
          or coalesce(array_length(profiles.photos, 1), 0) < 4
       returning photos`,
      [review.owner_user_id, review.public_url]
    );

    if (!saved.rows[0]) {
      throw new ApiError(409, "VALIDATION_ERROR", "The account cannot publish this profile photo.");
    }

    await client.query(
      `update content_reviews
       set status = 'allowed',
           moderation_status = 'allowed',
           flagged_reason = null,
           completed_at = now()
       where id = $1`,
      [review.content_review_id]
    );
    await client.query(
      `update profile_photo_manual_reviews
       set status = 'approved',
           object_key = null,
           encrypted_data_key = null,
           data_key_nonce = null,
           data_key_auth_tag = null,
           content_nonce = null,
           content_auth_tag = null,
           key_version = null,
           reviewed_at = $2,
           reviewed_by = $3,
           decision_reason = $4,
           updated_at = $2
       where id = $1`,
      [review.id, now, options.reviewerReference, options.reason ?? null]
    );

    return { id: review.id, status: "approved" as const, publicUrl: review.public_url };
  });
}

type RejectReviewOptions = ReviewDecisionOptions & CleanupOptions;

export async function rejectPendingProfilePhotoReview(
  db: DbClient,
  config: AppConfig,
  reviewId: string,
  options: RejectReviewOptions
) {
  const now = options.now?.() ?? new Date();
  const claimed = await runTransaction(db, async (client) => {
    const locked = await client.query<LockedReviewRow>(
      `select ${lockedReviewSelection}
       from profile_photo_manual_reviews
       where id = $1
       for update`,
      [reviewId]
    );
    const review = locked.rows[0];

    if (!review) {
      throw new ApiError(404, "NOT_FOUND", "Profile-photo review not found.");
    }

    if (review.status === "rejected") {
      return { review, alreadyRejected: true };
    }

    if (review.status !== "pending" || !review.object_key || !review.content_review_id) {
      throw new ApiError(409, "VALIDATION_ERROR", "This profile-photo review has already been decided.");
    }

    await client.query(
      `update profile_photo_manual_reviews
       set status = 'deleting',
           deletion_outcome = 'rejected',
           reviewed_at = $2,
           reviewed_by = $3,
           decision_reason = $4,
           updated_at = $2
       where id = $1
         and status = 'pending'`,
      [review.id, now, options.reviewerReference, options.reason ?? null]
    );

    return { review, alreadyRejected: false };
  });

  if (claimed.alreadyRejected) {
    return { id: claimed.review.id, status: "rejected" as const };
  }

  const deleteObject = options.deleteObject ?? deleteEncryptedMediaObject;

  try {
    await deleteObject(config, claimed.review.object_key as string);
  } catch {
    throw new ApiError(503, "MODERATION_UNAVAILABLE", "Photo deletion is pending a secure retry.");
  }

  await runTransaction(db, async (client) => {
    await client.query(
      `update content_reviews
       set status = 'rejected',
           moderation_status = 'blocked',
           flagged_reason = 'manual_review_rejected',
           completed_at = now()
       where id = $1`,
      [claimed.review.content_review_id]
    );
    await client.query(
      `update profile_photo_manual_reviews
       set status = 'rejected',
           object_key = null,
           encrypted_data_key = null,
           data_key_nonce = null,
           data_key_auth_tag = null,
           content_nonce = null,
           content_auth_tag = null,
           key_version = null,
           ciphertext_deleted_at = now(),
           updated_at = now()
       where id = $1
         and status = 'deleting'`,
      [claimed.review.id]
    );
  });

  return { id: claimed.review.id, status: "rejected" as const };
}

type PendingReviewListRow = {
  id: string;
  owner_user_id: string;
  mime_type: string;
  byte_size: number;
  status: "pending";
  created_at: string | Date;
  expires_at: string | Date;
};

function isoTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function listPendingProfilePhotoReviews(
  db: DbClient,
  config: AppConfig,
  limit = 25
) {
  const result = await db.query<PendingReviewListRow>(
    `select
       id,
       owner_user_id,
       mime_type,
       byte_size,
       status,
       created_at,
       expires_at
     from profile_photo_manual_reviews
     where status = 'pending'
       and expires_at > now()
     order by created_at asc
     limit $1`,
    [limit]
  );
  const pseudonymKey = config.STREAM_PSEUDONYM_KEY || config.INTERNAL_API_SECRET || "";

  return result.rows.map((review) => ({
    id: review.id,
    testerReference: `bank_${createHmac("sha256", pseudonymKey)
      .update(`bank-profile-review-user-v1:${review.owner_user_id}`)
      .digest("base64url")}`,
    mimeType: review.mime_type,
    byteSize: review.byte_size,
    status: review.status,
    createdAt: isoTimestamp(review.created_at),
    expiresAt: isoTimestamp(review.expires_at),
    imagePath: `/api/internal/profile-photo-reviews/${review.id}/image`
  }));
}

export type PendingProfilePhotoReviewImage = {
  id: string;
  object_key: string;
  mime_type: string;
  encrypted_data_key: string;
  data_key_nonce: string;
  data_key_auth_tag: string;
  content_nonce: string;
  content_auth_tag: string;
  key_version: string;
};

export async function getPendingProfilePhotoReviewImage(db: DbClient, reviewId: string) {
  const result = await db.query<PendingProfilePhotoReviewImage>(
    `select
       id,
       object_key,
       mime_type,
       encrypted_data_key,
       data_key_nonce,
       data_key_auth_tag,
       content_nonce,
       content_auth_tag,
       key_version
     from profile_photo_manual_reviews
     where id = $1
       and status = 'pending'
       and expires_at > now()
       and object_key is not null
     limit 1`,
    [reviewId]
  );

  return result.rows[0] ?? null;
}
