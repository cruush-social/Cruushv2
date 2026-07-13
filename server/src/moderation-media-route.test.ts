import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { encryptMediaBytes } from "./media-encryption.js";
import { writeEncryptedMediaObject } from "./media-storage.js";

describe("moderation media capability route", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("allows HEAD without consumption, one successful cookie-free GET, then rejects replay", async () => {
    const mediaDir = await mkdtemp(path.join(tmpdir(), "cruush-moderation-route-"));
    tempDirs.push(mediaDir);
    const config = {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://unused",
      CORS_ORIGIN: "https://staging.cruush.app",
      SESSION_SECRET: "test-moderation-route-secret",
      APP_URL: "https://staging.cruush.app",
      MEDIA_STORAGE_DIR: mediaDir,
      MEDIA_OBJECT_STORAGE_DRIVER: "local",
      MEDIA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
      MEDIA_ENCRYPTION_KEY_VERSION: "v1"
    } as AppConfig;
    const plaintext = Buffer.from("sanitized-image-bytes");
    const encrypted = encryptMediaBytes(config, plaintext);
    const objectKey = "profile-photos/11111111-1111-4111-8111-111111111111.enc";
    await writeEncryptedMediaObject(config, objectKey, encrypted.ciphertext);
    const grantRow = {
      id: "22222222-2222-4222-8222-222222222222",
      object_key: objectKey,
      mime_type: "image/jpeg",
      byte_size: plaintext.length,
      encrypted_data_key: encrypted.encryptedDataKey,
      data_key_nonce: encrypted.dataKeyNonce,
      data_key_auth_tag: encrypted.dataKeyAuthTag,
      content_nonce: encrypted.nonce,
      content_auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion
    };
    let redeemed = false;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("select") && sql.includes("from moderation_media_grants")) {
        return { rows: redeemed ? [] : [grantRow] };
      }

      if (sql.includes("update moderation_media_grants") && sql.includes("redeemed_at = now()")) {
        if (redeemed) {
          return { rows: [] };
        }

        redeemed = true;
        return { rows: [grantRow] };
      }

      return { rows: [] };
    });
    const app = buildServer(config, {
      db: { query, end: vi.fn().mockResolvedValue(undefined) } as unknown as DbClient
    });
    const token = "A".repeat(43);
    await app.ready();

    expect(app.printRoutes({ includeMeta: ["logLevel"] })).toContain("silent");

    const head = await app.inject({ method: "HEAD", url: `/api/moderation-media/${token}` });
    const first = await app.inject({ method: "GET", url: `/api/moderation-media/${token}` });
    const replay = await app.inject({ method: "GET", url: `/api/moderation-media/${token}` });
    await app.close();

    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
    expect(first.statusCode).toBe(200);
    expect(first.rawPayload).toEqual(plaintext);
    expect(first.headers["content-type"]).toContain("image/jpeg");
    expect(first.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(first.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(first.headers["referrer-policy"]).toBe("no-referrer");
    expect(replay.statusCode).toBe(404);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("redeemed_at = now()"))).toHaveLength(2);
  }, 15_000);

  it("returns 404 for an invalid, expired, revoked, or unknown token", async () => {
    const config = {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://unused",
      CORS_ORIGIN: "https://staging.cruush.app",
      SESSION_SECRET: "test-secret",
      APP_URL: "https://staging.cruush.app"
    } as AppConfig;
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = buildServer(config, {
      db: { query, end: vi.fn().mockResolvedValue(undefined) } as unknown as DbClient
    });

    const invalid = await app.inject({ method: "GET", url: "/api/moderation-media/not-a-capability" });
    const unavailable = await app.inject({ method: "GET", url: `/api/moderation-media/${"B".repeat(43)}` });
    await app.close();

    expect(invalid.statusCode).toBe(404);
    expect(unavailable.statusCode).toBe(404);
    for (const response of [invalid, unavailable]) {
      expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
      expect(response.headers["pragma"]).toBe("no-cache");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    }
  });

  it("does not write the raw capability path or token to application request logs", async () => {
    const token = "C".repeat(43);
    const logs: string[] = [];
    const config = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://unused",
      CORS_ORIGIN: "https://staging.cruush.app",
      SESSION_SECRET: "test-secret",
      APP_URL: "https://staging.cruush.app"
    } as AppConfig;
    const app = buildServer(config, {
      db: {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined)
      } as unknown as DbClient,
      logger: {
        level: "info",
        stream: {
          write(line: string) {
            logs.push(line);
          }
        }
      }
    });

    const response = await app.inject({ method: "GET", url: `/api/moderation-media/${token}` });
    await app.close();
    const logged = logs.join("");

    expect(response.statusCode).toBe(404);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("/api/moderation-media/");
  });
});
