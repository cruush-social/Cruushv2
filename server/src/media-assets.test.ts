import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { decryptMediaBytes } from "./media-encryption.js";
import {
  createPendingMediaAsset,
  moderatePendingMediaAsset,
  retainPendingMediaAssetForRetry
} from "./media-assets.js";
import { processUploadedImage } from "./media-image.js";
import { readEncryptedMediaObject } from "./media-storage.js";

const tempDirs: string[] = [];
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const mediaObjectId = "22222222-2222-4222-8222-222222222222";

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function setup(streamImageBridgeEnabled = true, overrides: Partial<AppConfig> = {}) {
  const mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-media-asset-"));
  tempDirs.push(mediaDir);
  const config = {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-at-least-thirty-two-bytes",
    MEDIA_ENCRYPTION_KEY: "test-media-secret-at-least-thirty-two-bytes",
    MEDIA_ENCRYPTION_KEY_VERSION: "v1",
    MEDIA_STORAGE_DIR: mediaDir,
    MEDIA_OBJECT_STORAGE_DRIVER: "local",
    STREAM_IMAGE_BRIDGE_ENABLED: streamImageBridgeEnabled,
    STREAM_MODERATION_ENABLED: false,
    MODERATION_PROVIDER: "mock",
    PHOTODNA_ENABLED: false,
    CSAM_REPORTING_ENABLED: false,
    ...overrides
  } as AppConfig;
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("select id, media_object_id, object_key") && sql.includes("expires_at <= now()")) {
      return { rows: [] };
    }

    if (sql.includes("with inserted_media as")) {
      return { rows: [{ id: mediaObjectId }] };
    }

    return { rows: [] };
  });
  const log = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  };
  const app = { config, db: { query }, log } as never;
  const request = { headers: {}, ip: "127.0.0.1", log } as never;

  return { app, config, query, request };
}

async function imageWithMetadata() {
  return sharp({
    create: {
      width: 240,
      height: 160,
      channels: 3,
      background: { r: 120, g: 20, b: 200 }
    }
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
}

describe("privacy-hardened media assets", () => {
  it.each(["profile_photo", "feed_photo"] as const)(
    "encrypts only sanitized canonical bytes for %s and does not create a legacy grant for shared automod",
    async (surface) => {
      const { app, config, query, request } = await setup(true);
      const uploadedBytes = await imageWithMetadata();
      const processed = await processUploadedImage(uploadedBytes, "image/jpeg");

      const asset = await createPendingMediaAsset(app, request, {
        ownerUserId,
        surface,
        processed
      });

      const calls = query.mock.calls as Array<[string, unknown[]?]>;
      const mediaInsert = calls.find(([sql]) => String(sql).includes("with inserted_media as"));
      const mediaParams = mediaInsert?.[1] as unknown[];
      const objectKey = mediaParams[3] as string;
      const ciphertext = await readEncryptedMediaObject(config, objectKey);
      const plaintext = decryptMediaBytes(config, {
        ciphertext,
        encryptedDataKey: mediaParams[8] as string,
        dataKeyNonce: mediaParams[9] as string,
        dataKeyAuthTag: mediaParams[10] as string,
        nonce: mediaParams[11] as string,
        authTag: mediaParams[12] as string,
        keyVersion: mediaParams[13] as string
      });

      expect(plaintext).toEqual(processed.canonicalBytes);
      expect(plaintext).not.toEqual(uploadedBytes);
      expect(mediaParams[5]).toBe(processed.canonicalBytes.length);
      expect(objectKey).toMatch(/^originals\/[0-9a-f-]{36}\.enc$/);
      expect(asset.grant).toBeUndefined();
      expect(calls.some(([sql]) => String(sql).includes("insert into moderation_media_grants"))).toBe(false);
    }
  );

  it("deletes every ciphertext object and the asset row when moderation rejects", async () => {
    const { app, config, query, request } = await setup(false);
    const processed = await processUploadedImage(await imageWithMetadata(), "image/jpeg");
    const asset = await createPendingMediaAsset(app, request, {
      ownerUserId,
      surface: "profile_photo",
      processed
    });

    await expect(moderatePendingMediaAsset(app, request, asset, {
      filename: "animal.jpg",
      moderationSurface: "profile_photo"
    })).rejects.toMatchObject({ code: "CONTENT_REJECTED" });

    for (const objectKey of asset.objectKeys) {
      await expect(readEncryptedMediaObject(config, objectKey)).rejects.toThrow();
    }

    const calls = query.mock.calls as Array<[string, unknown[]?]>;
    expect(calls.some(([sql, params]) => (
      String(sql).includes("delete from media_objects") &&
      params?.[0] === asset.id
    ))).toBe(true);
  });

  it("retains pending ciphertext when moderation is temporarily unavailable", async () => {
    const { app, query, request } = await setup(false);
    const asset = {
      id: mediaObjectId,
      ownerUserId,
      surface: "profile_photo" as const,
      mimeType: "image/jpeg" as const,
      width: 240,
      height: 160,
      byteSize: 12,
      displayUrl: `/api/media/assets/${mediaObjectId}/display`,
      thumbnailUrl: `/api/media/assets/${mediaObjectId}/thumbnail`,
      canonicalBytes: Buffer.from("canonical"),
      objectKeys: ["originals/photo.enc"]
    };

    await expect(retainPendingMediaAssetForRetry(app, request, asset, {
      provider: "stream+aws_rekognition",
      provider_request_id: "stream-async-image-1:rekognition-error-1",
      labels: [],
      latency_ms: 10,
      status: "error",
      raw_result: {
        stream: {
          status: "partial",
          task_id: "stream-async-image-1"
        },
        stream_status: "partial",
        rekognition_status: "error"
      },
      error: "AWS Rekognition unavailable"
    })).resolves.toBeUndefined();
    expect(query.mock.calls.some(([sql, params]) => (
      String(sql).includes("moderation_failure_reason = 'provider_unavailable'") &&
      String(sql).includes("streamModerationTaskId") &&
      params?.[0] === mediaObjectId &&
      params?.[1] === ownerUserId &&
      params?.[2] === false &&
      params?.[3] === "stream-async-image-1"
    ))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("delete from media_objects"))).toBe(false);
  });

  it("applies the active alpha PhotoDNA bypass to message-photo assets", async () => {
    const { app, request } = await setup(false, {
      NODE_ENV: "production",
      PHOTODNA_ENABLED: true,
      ALPHA_TEST_ENABLED: true,
      ALPHA_TEST_ENDS_AT: "2099-07-28T23:59:00-04:00"
    } as Partial<AppConfig>);
    const processed = await processUploadedImage(await imageWithMetadata(), "image/jpeg");
    const asset = await createPendingMediaAsset(app, request, {
      ownerUserId,
      surface: "message_photo",
      processed
    });

    await expect(moderatePendingMediaAsset(app, request, asset, {
      filename: "neutral-message-photo.jpg",
      moderationSurface: "direct_message"
    })).resolves.toMatchObject({
      moderation: {
        provider: "mock",
        photoDnaStatus: "not_configured",
        decision: expect.objectContaining({ decision: "allow" })
      }
    });
  });

  it("uses the signed bridge for message-photo assets without profile-photo automod", async () => {
    const { app, request } = await setup(true, {
      MEDIA_PUBLIC_BASE_URL: "https://api-staging.cruush.app",
      MEDIA_MODERATION_URL_SECRET: "test-moderation-url-secret-1234567890",
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false
    } as Partial<AppConfig>);
    const processed = await processUploadedImage(await imageWithMetadata(), "image/jpeg");
    const asset = await createPendingMediaAsset(app, request, {
      ownerUserId,
      surface: "message_photo",
      processed
    });

    await expect(moderatePendingMediaAsset(app, request, asset, {
      filename: "neutral-message-photo.jpg",
      moderationSurface: "direct_message"
    })).resolves.toMatchObject({
      moderation: {
        provider: "mock",
        decision: expect.objectContaining({ decision: "allow" })
      }
    });
    expect(asset.grant).toBeUndefined();
  });
});
