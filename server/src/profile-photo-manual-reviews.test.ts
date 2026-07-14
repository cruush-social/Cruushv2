import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import {
  BANK_PROFILE_PHOTO_REVIEW_TTL_MS,
  approvePendingProfilePhotoReview,
  cleanupExpiredProfilePhotoReviews,
  createPendingProfilePhotoReview,
  isBankProfilePhotoManualReviewEligible,
  rejectPendingProfilePhotoReview
} from "./profile-photo-manual-reviews.js";
import { ALLOW_POLICY_DECISION } from "./moderation-types.js";

const testerId = "11111111-1111-4111-8111-111111111111";
const fixedNow = new Date("2026-07-13T16:00:00.000Z");

function stagingConfig(): AppConfig {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused",
    CORS_ORIGIN: "https://staging.cruush.app",
    SESSION_SECRET: "test-secret",
    APP_URL: "https://staging.cruush.app",
    APP_DEPLOYMENT_STAGE: "staging",
    STREAM_IMAGE_BRIDGE_ENABLED: true,
    BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: true,
    BANK_PROFILE_PHOTO_TESTER_USER_IDS: [testerId]
  } as AppConfig;
}

describe("bank profile-photo manual reviews", () => {
  it("allows only explicitly allowlisted staging testers", () => {
    const config = stagingConfig();

    expect(isBankProfilePhotoManualReviewEligible(config, testerId)).toBe(true);
    expect(isBankProfilePhotoManualReviewEligible(config, "22222222-2222-4222-8222-222222222222")).toBe(false);
    expect(isBankProfilePhotoManualReviewEligible({
      ...config,
      APP_DEPLOYMENT_STAGE: "production"
    }, testerId)).toBe(false);
    expect(isBankProfilePhotoManualReviewEligible({
      ...config,
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: false
    }, testerId)).toBe(false);
    expect(isBankProfilePhotoManualReviewEligible({
      ...config,
      STREAM_IMAGE_BRIDGE_ENABLED: false
    }, testerId)).toBe(false);
    expect(isBankProfilePhotoManualReviewEligible({
      ...config,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true
    }, testerId)).toBe(false);
  });

  it("creates a queued review that expires exactly 30 minutes later without storing a capability token", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query, end: vi.fn() } as unknown as DbClient;

    const review = await createPendingProfilePhotoReview(db, {
      ownerUserId: testerId,
      mediaId: "33333333-3333-4333-8333-333333333333",
      objectKey: "profile-photos/33333333-3333-4333-8333-333333333333.enc",
      publicUrl: "/api/media/profile-photos/33333333-3333-4333-8333-333333333333.jpg",
      mimeType: "image/jpeg",
      byteSize: 1234,
      encryptedDataKey: "encrypted-data-key",
      dataKeyNonce: "data-key-nonce",
      dataKeyAuthTag: "data-key-auth-tag",
      contentNonce: "content-nonce",
      contentAuthTag: "content-auth-tag",
      keyVersion: "v1",
      photoDnaStatus: "not_configured",
      photoDnaProviderRequestId: null,
      providerResult: {
        provider: "stream",
        provider_request_id: "stream-request-1",
        labels: [],
        latency_ms: 20,
        status: "complete",
        recommended_action: "keep",
        raw_result: { cruush_profile_photo_gate: "manual_review_required" }
      },
      decision: {
        ...ALLOW_POLICY_DECISION,
        decision: "quarantine",
        reason_code: "bank_profile_photo_manual_review_required"
      }
    }, { now: () => fixedNow });

    expect(review).toMatchObject({
      status: "pending",
      publicUrl: "/api/media/profile-photos/33333333-3333-4333-8333-333333333333.jpg",
      expiresAt: new Date(fixedNow.getTime() + BANK_PROFILE_PHOTO_REVIEW_TTL_MS)
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toContain("insert into content_reviews");
    expect(String(query.mock.calls[1]?.[0])).toContain("insert into profile_photo_manual_reviews");
    expect(JSON.stringify(query.mock.calls)).not.toContain("capability");
    expect(JSON.stringify(query.mock.calls)).not.toContain("original filename");
  });

  it("deletes claimed expired ciphertext and scrubs its encryption metadata", async () => {
    const claimedRow = {
      id: "44444444-4444-4444-8444-444444444444",
      object_key: "profile-photos/44444444-4444-4444-8444-444444444444.enc",
      content_review_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      deletion_outcome: "expired"
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("returning review.id, review.object_key")) {
        return { rows: [claimedRow] };
      }

      return { rows: [] };
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const db = { query, end: vi.fn() } as unknown as DbClient;

    const deleted = await cleanupExpiredProfilePhotoReviews(
      db,
      stagingConfig(),
      25,
      { deleteObject }
    );

    expect(deleted).toBe(1);
    expect(deleteObject).toHaveBeenCalledWith(stagingConfig(), claimedRow.object_key);
    expect(query.mock.calls.some(([sql]) =>
      String(sql).includes("encrypted_data_key = null") &&
      String(sql).includes("ciphertext_deleted_at = now()")
    )).toBe(true);
    expect(query.mock.calls.some(([sql]) =>
      String(sql).includes("update content_reviews") &&
      String(sql).includes("manual_review_expired")
    )).toBe(true);
  });

  it("leaves a deletion claim retryable when object deletion fails", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("returning review.id, review.object_key")
        ? [{
            id: "55555555-5555-4555-8555-555555555555",
            object_key: "profile-photos/55555555-5555-4555-8555-555555555555.enc"
          }]
        : []
    }));
    const db = { query, end: vi.fn() } as unknown as DbClient;

    const deleted = await cleanupExpiredProfilePhotoReviews(
      db,
      stagingConfig(),
      25,
      { deleteObject: vi.fn().mockRejectedValue(new Error("R2 unavailable")) }
    );

    expect(deleted).toBe(0);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("ciphertext_deleted_at = now()"))).toBe(false);
  });

  it("atomically publishes an approved pending review and scrubs duplicate encryption metadata", async () => {
    const reviewId = "66666666-6666-4666-8666-666666666666";
    const publicUrl = "/api/media/profile-photos/33333333-3333-4333-8333-333333333333.jpg";
    const pendingRow = {
      id: reviewId,
      owner_user_id: testerId,
      media_id: "33333333-3333-4333-8333-333333333333",
      content_review_id: "77777777-7777-4777-8777-777777777777",
      object_key: "profile-photos/33333333-3333-4333-8333-333333333333.enc",
      public_url: publicUrl,
      mime_type: "image/jpeg",
      byte_size: 1234,
      encrypted_data_key: "encrypted-data-key",
      data_key_nonce: "data-key-nonce",
      data_key_auth_tag: "data-key-auth-tag",
      content_nonce: "content-nonce",
      content_auth_tag: "content-auth-tag",
      key_version: "v1",
      photodna_status: "not_configured",
      photodna_provider_request_id: null,
      status: "pending",
      expires_at: "2026-07-13T16:30:00.000Z"
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("for update") && sql.includes("profile_photo_manual_reviews")) {
        return { rows: [pendingRow] };
      }

      if (sql.includes("insert into profiles")) {
        return { rows: [{ photos: [publicUrl] }] };
      }

      return { rows: [] };
    });
    const db = {
      query,
      end: vi.fn(),
      transaction: async <T>(fn: (client: DbClient) => Promise<T>) => fn(db as unknown as DbClient)
    } as unknown as DbClient;

    const result = await approvePendingProfilePhotoReview(db, reviewId, {
      reviewerReference: "bank-reviewer",
      reason: "Consented adult tester photo",
      now: () => fixedNow
    });

    expect(result).toEqual({ id: reviewId, status: "approved", publicUrl });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into media_objects"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into profiles"))).toBe(true);
    expect(query.mock.calls.some(([sql]) =>
      String(sql).includes("status = 'approved'") &&
      String(sql).includes("encrypted_data_key = null")
    )).toBe(true);
  });

  it("returns an already approved review without publishing the photo twice", async () => {
    const reviewId = "88888888-8888-4888-8888-888888888888";
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("for update")
        ? [{
            id: reviewId,
            status: "approved",
            public_url: "/api/media/profile-photos/already-approved.jpg"
          }]
        : []
    }));
    const db = {
      query,
      end: vi.fn(),
      transaction: async <T>(fn: (client: DbClient) => Promise<T>) => fn(db as unknown as DbClient)
    } as unknown as DbClient;

    const result = await approvePendingProfilePhotoReview(db, reviewId, {
      reviewerReference: "bank-reviewer",
      now: () => fixedNow
    });

    expect(result.status).toBe("approved");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into media_objects"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into profiles"))).toBe(false);
  });

  it("blocks approval before deleting rejected ciphertext and finalizes the audit record", async () => {
    const reviewId = "99999999-9999-4999-8999-999999999999";
    const objectKey = "profile-photos/99999999-9999-4999-8999-999999999999.enc";
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("for update")
        ? [{
            id: reviewId,
            content_review_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            object_key: objectKey,
            status: "pending",
            expires_at: "2026-07-13T16:30:00.000Z"
          }]
        : []
    }));
    const db = {
      query,
      end: vi.fn(),
      transaction: async <T>(fn: (client: DbClient) => Promise<T>) => fn(db as unknown as DbClient)
    } as unknown as DbClient;
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    const result = await rejectPendingProfilePhotoReview(db, stagingConfig(), reviewId, {
      reviewerReference: "bank-reviewer",
      reason: "Photo is not of the tester",
      now: () => fixedNow,
      deleteObject
    });

    expect(result).toEqual({ id: reviewId, status: "rejected" });
    expect(deleteObject).toHaveBeenCalledWith(stagingConfig(), objectKey);
    const transitionIndex = query.mock.calls.findIndex(([sql]) => String(sql).includes("status = 'deleting'"));
    const finalIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes("status = 'rejected'") && String(sql).includes("encrypted_data_key = null")
    );
    expect(transitionIndex).toBeGreaterThanOrEqual(0);
    expect(finalIndex).toBeGreaterThan(transitionIndex);
  });
});
