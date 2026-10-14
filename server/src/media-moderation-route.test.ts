import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { createMediaModerationInspectionUrl } from "./media-moderation-url.js";
import { writeEncryptedMediaObject } from "./media-storage.js";

describe("signed Stream moderation media route", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("serves only a valid signed GET for the encrypted pending display variant", async () => {
    const mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-signed-moderation-route-"));
    tempDirs.push(mediaDir);
    const config = {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://unused",
      CORS_ORIGIN: "https://cruush.test",
      SESSION_SECRET: "test-signed-moderation-route-secret",
      STREAM_NO_AI_TRAINING_VERIFIED: true,
      APP_URL: "https://cruush.test",
      MEDIA_STORAGE_DIR: mediaDir,
      MEDIA_PUBLIC_BASE_URL: "https://api.cruush.test",
      MEDIA_MODERATION_URL_SECRET: "0123456789abcdef0123456789abcdef",
      MEDIA_MODERATION_URL_TTL_SECONDS: 120,
      MEDIA_OBJECT_STORAGE_DRIVER: "local",
      MEDIA_ENCRYPTION_KEY: "abcdef0123456789abcdef0123456789",
      MEDIA_ENCRYPTION_KEY_VERSION: "v1"
    } as AppConfig;
    const assetId = "11111111-1111-4111-8111-111111111111";
    const plaintext = Buffer.from("sanitized-display-webp-bytes");
    const encrypted = encryptMediaBytes(config, plaintext);
    const objectKey = `variants/${assetId}/display.webp.enc`;
    await writeEncryptedMediaObject(config, objectKey, encrypted.ciphertext);
    let pending = true;
    const query = vi.fn(async (sql: string) => {
      if (pending && sql.includes("join media_variants") && sql.includes("media.moderation_status = 'pending'")) {
        return {
          rows: [{
            owner_user_id: "22222222-2222-4222-8222-222222222222",
            surface: "profile_photo",
            object_key: objectKey,
            mime_type: "image/webp",
            encrypted_data_key: encrypted.encryptedDataKey,
            data_key_nonce: encrypted.dataKeyNonce,
            data_key_auth_tag: encrypted.dataKeyAuthTag,
            content_nonce: encrypted.nonce,
            content_auth_tag: encrypted.authTag,
            key_version: encrypted.keyVersion
          }]
        };
      }

      return { rows: [] };
    });
    const app = buildServer(config, {
      db: { query, end: vi.fn().mockResolvedValue(undefined) } as unknown as DbClient
    });
    const signed = new URL(createMediaModerationInspectionUrl(config, assetId));
    const requestUrl = `${signed.pathname}${signed.search}`;
    config.STREAM_NO_AI_TRAINING_VERIFIED = false;
    expect((await app.inject({ method: "GET", url: requestUrl })).statusCode).toBe(404);
    expect(query).not.toHaveBeenCalled();
    config.STREAM_NO_AI_TRAINING_VERIFIED = true;
    const valid = await app.inject({ method: "GET", url: requestUrl });
    const head = await app.inject({ method: "HEAD", url: requestUrl });
    const tampered = new URL(signed);
    tampered.searchParams.set("signature", "A".repeat(43));
    const invalid = await app.inject({ method: "GET", url: `${tampered.pathname}${tampered.search}` });
    pending = false;
    const noLongerPending = await app.inject({ method: "GET", url: requestUrl });
    await app.close();

    expect(valid.statusCode).toBe(200);
    expect(valid.rawPayload).toEqual(plaintext);
    expect(valid.headers["content-type"]).toContain("image/webp");
    expect(valid.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(valid.headers["x-content-type-options"]).toBe("nosniff");
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers["content-type"]).toContain("image/webp");
    expect(invalid.statusCode).toBe(404);
    expect(noLongerPending.statusCode).toBe(404);
  });
});
