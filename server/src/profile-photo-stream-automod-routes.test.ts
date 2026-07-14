import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderModerationResult } from "./moderation-types.js";

const providerState = vi.hoisted(() => ({
  result: {
    provider: "stream",
    provider_request_id: "stream-keep-1",
    labels: [],
    latency_ms: 12,
    status: "completed",
    recommended_action: "keep",
    raw_result: {}
  } as ProviderModerationResult
}));

vi.mock("./moderation-provider.js", () => ({
  createModerationProvider: () => ({
    name: "stream",
    version: "test",
    moderateText: vi.fn(),
    moderateImage: vi.fn(async () => providerState.result)
  })
}));

import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { deleteEncryptedMediaObject, readEncryptedMediaObject } from "./media-storage.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const userId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";
const validPng = () => Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function multipartFilePayload(content: Buffer) {
  const boundary = `----cruush-stream-automod-${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="photo"; filename="profile.png"\r\n' +
    "Content-Type: image/png\r\n\r\n"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    payload: Buffer.concat([head, content, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function createTestApp() {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("with inserted_media as")) {
      return { rows: [{ id: params[0] }] };
    }

    if (sql === "select photos from profiles where id = $1") {
      return { rows: [{ photos: [] }] };
    }

    if (sql.includes("select (redeemed_at is not null) as redeemed")) {
      return { rows: [{ redeemed: true }] };
    }

    if (sql.includes("returning photos")) {
      return { rows: [{ photos: [params[2]] }] };
    }

    return { rows: [] };
  });
  const end = vi.fn(async () => undefined);
  const config = {
    NODE_ENV: "test",
    APP_DEPLOYMENT_STAGE: "staging",
    PORT: 3001,
    HOST: "127.0.0.1",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
    CORS_ORIGIN: "http://localhost:5173",
    SESSION_SECRET: "test-secret",
    APP_URL: "https://cruush.test",
    MEDIA_STORAGE_DIR: join(tmpdir(), `cruush-stream-automod-${randomUUID()}`),
    MEDIA_OBJECT_STORAGE_DRIVER: "local",
    PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
    STREAM_MODERATION_ENABLED: true,
    STREAM_IMAGE_BRIDGE_ENABLED: true,
    MODERATION_MEDIA_BASE_URL: "https://moderation-media-staging.cruush.app",
    STREAM_PSEUDONYM_KEY: "0123456789abcdef0123456789abcdef",
    HUMAN_MODERATION_ENABLED: false,
    BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: false,
    BANK_PROFILE_PHOTO_TESTER_USER_IDS: [userId],
    MEDIA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    MEDIA_ENCRYPTION_KEY_VERSION: "v1"
  } as AppConfig;
  const app = buildServer(config, {
    db: { query, end } as unknown as DbClient,
    rateLimiter: createMemoryRateLimiter()
  });

  return { app, config, query };
}

describe("shared Stream profile-photo automod route", () => {
  beforeEach(() => {
    providerState.result = {
      provider: "stream",
      provider_request_id: "stream-keep-1",
      labels: [],
      latency_ms: 12,
      status: "completed",
      recommended_action: "keep",
      raw_result: {}
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("publishes a complete Stream keep without creating or returning manual review", async () => {
    const { app, query } = createTestApp();
    const multipart = multipartFilePayload(validPng());
    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const sql = query.mock.calls.map(([text]) => String(text));
    const mediaCall = query.mock.calls.find(([text]) => String(text).includes("insert into media_objects"));

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({
      data: {
        url: expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/)
      }
    });
    expect(sql.some((text) => text.includes("insert into profile_photo_manual_reviews"))).toBe(false);
    expect(response.body).not.toContain("pending_review");
    expect(JSON.stringify(query.mock.calls)).toContain("stream_content_safety_only");

    await app.close();
    await Promise.all([
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ].map((objectKey) => deleteEncryptedMediaObject(app.config, objectKey as string)));
  });

  it("fails closed and removes ciphertext for a partial Stream response", async () => {
    providerState.result = {
      provider: "stream",
      provider_request_id: "stream-partial-1",
      labels: [],
      latency_ms: 12,
      status: "partial",
      recommended_action: "keep",
      raw_result: {},
      error: "Stream returned an incomplete image moderation response."
    };
    const { app, query } = createTestApp();
    const multipart = multipartFilePayload(validPng());
    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const sql = query.mock.calls.map(([text]) => String(text));
    const mediaCall = query.mock.calls.find(([text]) => String(text).includes("insert into media_objects"));
    const objectKeys = [
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ] as string[];

    expect(response.statusCode, response.body).toBe(503);
    expect(sql.some((text) => text.includes("insert into media_objects"))).toBe(true);
    expect(sql.some((text) => text.includes("insert into profiles"))).toBe(false);
    expect(sql.some((text) => text.includes("insert into profile_photo_manual_reviews"))).toBe(false);
    expect(sql.some((text) => text.includes("delete from media_objects"))).toBe(true);
    for (const objectKey of objectKeys) {
      await expect(readEncryptedMediaObject(app.config, objectKey)).rejects.toThrow();
    }

    await app.close();
  });
});
