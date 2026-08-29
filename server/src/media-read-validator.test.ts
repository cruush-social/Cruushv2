import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { writeEncryptedMediaObject } from "./media-storage.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const objectKey = "objects/33333333-3333-4333-8333-333333333333.enc";

describe("media read validators", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function testConfig() {
    const mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-media-validator-"));
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
      MEDIA_ENCRYPTION_KEY_VERSION: "v1"
    } as AppConfig;
  }

  async function buildMediaServer(config: AppConfig) {
    const plaintext = Buffer.from("encrypted-media-body");
    const encrypted = encryptMediaBytes(config, plaintext);
    await writeEncryptedMediaObject(config, objectKey, encrypted.ciphertext);

    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("from media_objects media")
        ? [{
            owner_user_id: ownerId,
            surface: "profile_photo",
            object_key: objectKey,
            mime_type: "image/png",
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
      db: { query, end: async () => {} } as unknown as DbClient
    });

    return { app, plaintext };
  }

  it("returns the body with a validator and revalidating cache directives", async () => {
    const config = await testConfig();
    const { app, plaintext } = await buildMediaServer(config);

    const response = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": ownerId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-cache");
    expect(response.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.rawPayload.equals(plaintext)).toBe(true);

    await app.close();
  });

  it("answers a matching validator with 304 without reading the stored object", async () => {
    const config = await testConfig();
    const { app } = await buildMediaServer(config);

    const first = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": ownerId }
    });
    const entityTag = first.headers.etag as string;

    // Removing the stored object proves the revalidated request never reached
    // the read-and-decrypt path: it would fail rather than return 304.
    await rm(config.MEDIA_STORAGE_DIR as string, { recursive: true, force: true });

    const revalidated = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": ownerId, "if-none-match": entityTag }
    });

    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.rawPayload.length).toBe(0);
    expect(revalidated.headers.etag).toBe(entityTag);

    await app.close();
  });

  it("still requires authentication when a validator is supplied", async () => {
    const config = await testConfig();
    const { app } = await buildMediaServer(config);

    const authenticated = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": ownerId }
    });

    const anonymous = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "if-none-match": authenticated.headers.etag as string }
    });

    expect(anonymous.statusCode).toBe(401);

    await app.close();
  });
});
