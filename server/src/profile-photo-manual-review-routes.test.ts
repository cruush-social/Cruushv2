import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { readEncryptedMediaObject, writeEncryptedMediaObject } from "./media-storage.js";

const internalSecret = "0123456789abcdef0123456789abcdef";
const testerId = "11111111-1111-4111-8111-111111111111";
const reviewId = "22222222-2222-4222-8222-222222222222";

describe("internal bank profile-photo review routes", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function testConfig() {
    const mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-bank-review-route-"));
    tempDirs.push(mediaDir);
    return {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://unused",
      CORS_ORIGIN: "https://staging.cruush.app",
      SESSION_SECRET: "test-secret",
      APP_URL: "https://staging.cruush.app",
      APP_DEPLOYMENT_STAGE: "staging",
      MEDIA_STORAGE_DIR: mediaDir,
      MEDIA_OBJECT_STORAGE_DRIVER: "local",
      MEDIA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
      MEDIA_ENCRYPTION_KEY_VERSION: "v1",
      STREAM_PSEUDONYM_KEY: "abcdef0123456789abcdef0123456789",
      INTERNAL_API_SECRET: internalSecret,
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: true,
      BANK_PROFILE_PHOTO_TESTER_USER_IDS: [testerId],
      STREAM_IMAGE_BRIDGE_ENABLED: true
    } as AppConfig;
  }

  it("requires the internal secret and omits owner and storage metadata from the queue", async () => {
    const config = await testConfig();
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("from profile_photo_manual_reviews")
        ? [{
            id: reviewId,
            owner_user_id: testerId,
            mime_type: "image/jpeg",
            byte_size: 1234,
            status: "pending",
            created_at: "2026-07-13T16:00:00.000Z",
            expires_at: "2026-07-13T16:30:00.000Z",
            object_key: "must-not-leak",
            encrypted_data_key: "must-not-leak"
          }]
        : []
    }));
    const app = buildServer(config, {
      db: { query, end: vi.fn() } as unknown as DbClient
    });

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/internal/profile-photo-reviews"
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/api/internal/profile-photo-reviews",
      headers: { "x-internal-secret": internalSecret }
    });
    await app.close();
    const serialized = JSON.stringify(allowed.json());

    expect(forbidden.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({
      data: [{
        id: reviewId,
        testerReference: expect.stringMatching(/^bank_[A-Za-z0-9_-]{43}$/),
        mimeType: "image/jpeg",
        byteSize: 1234,
        status: "pending",
        createdAt: "2026-07-13T16:00:00.000Z",
        expiresAt: "2026-07-13T16:30:00.000Z",
        imagePath: `/api/internal/profile-photo-reviews/${reviewId}/image`
      }]
    });
    expect(serialized).not.toContain(testerId);
    expect(serialized).not.toContain("object_key");
    expect(serialized).not.toContain("encrypted_data_key");
    expect(serialized).not.toContain("must-not-leak");
  });

  it("disables the review API outside the explicit staging fallback", async () => {
    const config = {
      ...await testConfig(),
      APP_DEPLOYMENT_STAGE: "production",
      BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: false
    } as AppConfig;
    const app = buildServer(config, {
      db: {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn()
      } as unknown as DbClient
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/profile-photo-reviews",
      headers: { "x-internal-secret": internalSecret }
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "FORBIDDEN" }
    });
  });

  it("disables the review API whenever shared Stream automod is active", async () => {
    const config = {
      ...await testConfig(),
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true
    } as AppConfig;
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildServer(config, {
      db: { query, end: vi.fn() } as unknown as DbClient
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/profile-photo-reviews",
      headers: { "x-internal-secret": internalSecret }
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("decrypts a pending review only in memory with strict no-cache headers", async () => {
    const config = await testConfig();
    const plaintext = Buffer.from("sanitized-profile-photo");
    const encrypted = encryptMediaBytes(config, plaintext);
    const objectKey = "profile-photos/33333333-3333-4333-8333-333333333333.enc";
    await writeEncryptedMediaObject(config, objectKey, encrypted.ciphertext);
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("from profile_photo_manual_reviews")
        ? [{
            id: reviewId,
            object_key: objectKey,
            mime_type: "image/jpeg",
            encrypted_data_key: encrypted.encryptedDataKey,
            data_key_nonce: encrypted.dataKeyNonce,
            data_key_auth_tag: encrypted.dataKeyAuthTag,
            content_nonce: encrypted.nonce,
            content_auth_tag: encrypted.authTag,
            key_version: encrypted.keyVersion
          }]
        : []
    }));
    const app = buildServer(config, {
      db: { query, end: vi.fn() } as unknown as DbClient
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/internal/profile-photo-reviews/${reviewId}/image`,
      headers: { "x-internal-secret": internalSecret }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(plaintext);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("approves a pending review through the internal command endpoint", async () => {
    const config = await testConfig();
    const publicUrl = "/api/media/profile-photos/33333333-3333-4333-8333-333333333333.jpg";
    const pendingRow = {
      id: reviewId,
      owner_user_id: testerId,
      media_id: "33333333-3333-4333-8333-333333333333",
      content_review_id: "44444444-4444-4444-8444-444444444444",
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
      expires_at: "2099-07-13T16:30:00.000Z"
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("for update")) return { rows: [pendingRow] };
      if (sql.includes("insert into profiles")) return { rows: [{ photos: [publicUrl] }] };
      return { rows: [] };
    });
    const db = {
      query,
      end: vi.fn(),
      transaction: async <T>(fn: (client: DbClient) => Promise<T>) => fn(db as unknown as DbClient)
    } as unknown as DbClient;
    const app = buildServer(config, { db });

    const response = await app.inject({
      method: "POST",
      url: `/api/internal/profile-photo-reviews/${reviewId}/approve`,
      headers: { "x-internal-secret": internalSecret },
      payload: {
        reviewerReference: "bank-reviewer",
        reason: "Consented adult tester photo"
      }
    });
    await app.close();

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: { id: reviewId, status: "approved", publicUrl }
    });
  });

  it("rejects a pending review, deletes ciphertext, and returns an idempotent outcome", async () => {
    const config = await testConfig();
    const objectKey = "profile-photos/55555555-5555-4555-8555-555555555555.enc";
    await writeEncryptedMediaObject(config, objectKey, Buffer.from("ciphertext"));
    let status: "pending" | "rejected" = "pending";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("for update")) {
        return {
          rows: [{
            id: reviewId,
            content_review_id: "66666666-6666-4666-8666-666666666666",
            object_key: status === "pending" ? objectKey : null,
            public_url: "/api/media/profile-photos/55555555-5555-4555-8555-555555555555.jpg",
            status,
            expires_at: "2099-07-13T16:30:00.000Z"
          }]
        };
      }

      if (sql.includes("status = 'rejected'")) status = "rejected";
      return { rows: [] };
    });
    const db = {
      query,
      end: vi.fn(),
      transaction: async <T>(fn: (client: DbClient) => Promise<T>) => fn(db as unknown as DbClient)
    } as unknown as DbClient;
    const app = buildServer(config, { db });

    const response = await app.inject({
      method: "POST",
      url: `/api/internal/profile-photo-reviews/${reviewId}/reject`,
      headers: { "x-internal-secret": internalSecret },
      payload: {
        reviewerReference: "bank-reviewer",
        reason: "Photo is not of the tester"
      }
    });
    await app.close();

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: { id: reviewId, status: "rejected" } });
    await expect(readEncryptedMediaObject(config, objectKey)).rejects.toThrow();
  });
});
