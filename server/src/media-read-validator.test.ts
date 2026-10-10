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
const viewerId = "44444444-4444-4444-8444-444444444444";
const assetId = "22222222-2222-4222-8222-222222222222";
const objectKey = "objects/33333333-3333-4333-8333-333333333333.enc";

describe("media read validators", () => {
  const tempDirs: string[] = [];
  const servers: ReturnType<typeof buildServer>[] = [];

  afterEach(async () => {
    try {
      await Promise.all(servers.splice(0).map((app) => app.close()));
    } finally {
      await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
      vi.restoreAllMocks();
    }
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

  async function buildMediaServer(config: AppConfig, options: {
    surface?: "profile_photo" | "feed_photo";
    ownerStatus?: () => "active" | "banned" | "suspended";
    feedAccess?: {
      owner_user_id: string;
      audience: "public" | "mutuals" | "crowd";
      has_shared_crowd: boolean;
    };
  } = {}) {
    const plaintext = Buffer.from("encrypted-media-body");
    const encrypted = encryptMediaBytes(config, plaintext);
    await writeEncryptedMediaObject(config, objectKey, encrypted.ciphertext);

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from app_users") && sql.includes("account_status = 'banned'")) {
        return { rows: options.ownerStatus?.() === "banned" ? [{ id: ownerId }] : [] };
      }
      if (sql.includes("from media_objects media")) {
        return {
          rows: [{
            owner_user_id: ownerId,
            surface: options.surface ?? "profile_photo",
            object_key: objectKey,
            mime_type: "image/png",
            encrypted_data_key: encrypted.encryptedDataKey,
            data_key_nonce: encrypted.dataKeyNonce,
            data_key_auth_tag: encrypted.dataKeyAuthTag,
            content_nonce: encrypted.nonce,
            content_auth_tag: encrypted.authTag,
            key_version: encrypted.keyVersion
          }]
        };
      }

      if (sql.includes("from feed_post_attachments attachment")) {
        return { rows: options.feedAccess ? [options.feedAccess] : [] };
      }

      if (sql.includes("from user_blocks")) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const app = buildServer(config, {
      db: { query, end: async () => {} } as unknown as DbClient
    });
    servers.push(app);

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

  it("revokes an approved body and matching cache validator on ban, preserving suspended and unban reads", async () => {
    const config = await testConfig();
    let ownerStatus: "active" | "banned" | "suspended" = "active";
    const { app, plaintext } = await buildMediaServer(config, { ownerStatus: () => ownerStatus });
    const read = (etag?: string) => app.inject({
      method: "GET", url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": ownerId, ...(etag ? { "if-none-match": etag } : {}) }
    });
    const initial = await read();
    expect(initial.statusCode).toBe(200);
    const etag = initial.headers.etag as string;
    ownerStatus = "banned";
    for (const validator of [undefined, etag]) {
      const denied = await read(validator);
      expect(denied.statusCode).toBe(404);
      expect(denied.headers.etag).toBeUndefined();
      expect(denied.rawPayload.equals(plaintext)).toBe(false);
    }
    ownerStatus = "suspended";
    expect((await read(etag)).statusCode).toBe(304);
    ownerStatus = "active";
    expect((await read()).rawPayload.equals(plaintext)).toBe(true);
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

  it("serves an attached public Feed photo to an authenticated unblocked viewer", async () => {
    const config = await testConfig();
    const { app, plaintext } = await buildMediaServer(config, {
      surface: "feed_photo",
      feedAccess: {
        owner_user_id: ownerId,
        audience: "public",
        has_shared_crowd: false
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": viewerId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(plaintext)).toBe(true);

    await app.close();
  });

  it("does not serve a Feed photo when the viewer lacks its Crowd audience", async () => {
    const config = await testConfig();
    const { app } = await buildMediaServer(config, {
      surface: "feed_photo",
      feedAccess: {
        owner_user_id: ownerId,
        audience: "crowd",
        has_shared_crowd: false
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/media/assets/${assetId}/display`,
      headers: { "x-user-id": viewerId }
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
