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
  } as ProviderModerationResult,
  rekognitionLabels: [{
    Name: "Person",
    Confidence: 99,
    Parents: [] as Array<{ Name: string }>
  }],
  rekognitionFaces: [{
    Confidence: 99,
    AgeRange: { Low: 25, High: 35 }
  }],
  rekognitionModerationLabels: [] as Array<{ Name: string; ParentName?: string; Confidence: number }>,
  rekognitionError: null as Error | null,
  lastImageUrl: null as string | null
}));

vi.mock("@aws-sdk/client-rekognition", () => ({
  DetectLabelsCommand: class DetectLabelsCommand {
    constructor(readonly input: unknown) {}
  },
  DetectFacesCommand: class DetectFacesCommand {
    constructor(readonly input: unknown) {}
  },
  DetectModerationLabelsCommand: class DetectModerationLabelsCommand {
    constructor(readonly input: unknown) {}
  },
  RekognitionClient: class RekognitionClient {
    async send(command: { constructor: { name: string } }) {
      if (providerState.rekognitionError) {
        throw providerState.rekognitionError;
      }

      if (command.constructor.name === "DetectFacesCommand") {
        return {
          FaceDetails: providerState.rekognitionFaces,
          $metadata: { requestId: "rekognition-faces-request-1" }
        };
      }

      if (command.constructor.name === "DetectModerationLabelsCommand") {
        return {
          ModerationLabels: providerState.rekognitionModerationLabels,
          $metadata: { requestId: "rekognition-moderation-request-1" }
        };
      }

      return {
        Labels: providerState.rekognitionLabels,
        $metadata: { requestId: "rekognition-request-1" }
      };
    }
  }
}));

vi.mock("./moderation-provider.js", () => {
  const provider = {
    name: "stream",
    version: "test",
    moderateText: vi.fn(),
    moderateImage: vi.fn(async (input: { imageUrl?: string }) => {
      providerState.lastImageUrl = input.imageUrl ?? null;
      return providerState.result;
    })
  };

  return {
    createModerationProvider: () => provider,
    createModerationProviderOrUnavailable: () => provider
  };
});

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
    MEDIA_PUBLIC_BASE_URL: "https://api.cruush.test",
    MEDIA_MODERATION_URL_SECRET: "0123456789abcdef0123456789abcdef",
    MEDIA_MODERATION_URL_TTL_SECONDS: 120,
    MEDIA_STORAGE_DIR: join(tmpdir(), `cruush-stream-automod-${randomUUID()}`),
    MEDIA_OBJECT_STORAGE_DRIVER: "local",
    PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
    PROFILE_PHOTO_REKOGNITION_ENABLED: true,
    PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
    PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
    PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
    PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
    PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18,
    PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000,
    SEVERE_ACCESS_BANS_ENABLED: true,
    SEVERE_ACCESS_BAN_HMAC_KEY: "0123456789abcdef0123456789abcdef",
    TRUST_PROXY_HOPS: 1,
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
    providerState.rekognitionLabels = [{
      Name: "Person",
      Confidence: 99,
      Parents: []
    }];
    providerState.rekognitionFaces = [{
      Confidence: 99,
      AgeRange: { Low: 25, High: 35 }
    }];
    providerState.rekognitionModerationLabels = [];
    providerState.rekognitionError = null;
    providerState.lastImageUrl = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("publishes only when Stream keeps and Rekognition detects a human", async () => {
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
        url: expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/),
        photos: [expect.stringMatching(/^\/api\/media\/assets\/[0-9a-f-]{36}\/display$/)],
        explicit: false
      }
    });
    expect(sql.some((text) => text.includes("insert into profile_photo_manual_reviews"))).toBe(false);
    expect(response.body).not.toContain("pending_review");
    expect(JSON.stringify(query.mock.calls)).toContain("human_detected");
    expect(JSON.stringify(query.mock.calls)).not.toContain("stream_content_safety_only");
    const inspectionUrl = new URL(providerState.lastImageUrl ?? "");
    expect(inspectionUrl.origin).toBe("https://api.cruush.test");
    expect(inspectionUrl.pathname).toMatch(/^\/api\/media\/moderation\/[0-9a-f-]{36}\/display$/);
    expect(inspectionUrl.searchParams.get("purpose")).toBe("moderation_inspection");
    expect(inspectionUrl.searchParams.get("signature")).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await app.close();
    await Promise.all([
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ].map((objectKey) => deleteEncryptedMediaObject(app.config, objectKey as string)));
  });

  it("fails closed and deletes ciphertext when Stream keeps but no human is detected", async () => {
    providerState.rekognitionLabels = [{
      Name: "Landscape",
      Confidence: 99,
      Parents: []
    }];
    providerState.rekognitionFaces = [];
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
    const mediaCall = query.mock.calls.find(([text]) => String(text).includes("insert into media_objects"));

    const objectKeys = [
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ] as string[];

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "CONTENT_REJECTED" } });
    expect(JSON.stringify(query.mock.calls)).toContain("human_not_detected");
    expect(query.mock.calls.some(([text]) => String(text).includes("insert into profiles"))).toBe(false);
    for (const objectKey of objectKeys) {
      await expect(readEncryptedMediaObject(app.config, objectKey)).rejects.toThrow();
    }

    await app.close();
  });

  it("suspends the account for human review when a child face is detected", async () => {
    providerState.rekognitionFaces = [{
      Confidence: 99,
      AgeRange: { Low: 6, High: 10 }
    }];
    const { app, query } = createTestApp();
    const multipart = multipartFilePayload(validPng());
    const response = await app.inject({
      method: "POST",
      url: "/api/profile-photos",
      headers: {
        "x-user-id": userId,
        cookie: `cruush_device=${"A".repeat(43)}`,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });
    const sql = query.mock.calls.map(([text]) => String(text));

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "CONTENT_REJECTED",
        message: expect.stringContaining("suspended for human review")
      }
    });
    expect(JSON.stringify(query.mock.calls)).toContain("minor_face_detected");
    expect(sql.some((text) => text.includes("insert into suspensions"))).toBe(true);
    expect(sql.some((text) => text.includes("user_trust_profiles"))).toBe(true);
    expect(sql.filter((text) => text.includes("insert into severe_access_bans"))).toHaveLength(0);
    expect(sql.some((text) => text.includes("insert into profiles"))).toBe(false);

    await app.close();
  });

  it("allows adult nudity on profile photos and classifies it explicit for DL Mode", async () => {
    providerState.result = {
      provider: "stream",
      provider_request_id: "stream-adult-nudity-1",
      labels: [{
        provider_label: "Non-Explicit Nudity",
        normalized_label: "adult_nudity",
        confidence: 0.98,
        severity: "low"
      }],
      latency_ms: 12,
      status: "completed",
      recommended_action: "keep",
      raw_result: {}
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
    const mediaCall = query.mock.calls.find(([text]) => String(text).includes("insert into media_objects"));

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      data: {
        explicit: true
      }
    });
    expect(query.mock.calls.some(([text]) => String(text).includes("delete from media_objects"))).toBe(false);
    expect(query.mock.calls.some(([text]) => String(text).includes("insert into profiles"))).toBe(true);
    await app.close();
    await Promise.all([
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ].map((objectKey) => deleteEncryptedMediaObject(app.config, objectKey as string)));
  });

  it("rejects an animal even when a person is also present", async () => {
    providerState.rekognitionLabels = [{
      Name: "Person",
      Confidence: 99,
      Parents: []
    }, {
      Name: "Dog",
      Confidence: 96,
      Parents: [{ Name: "Animal" }]
    }];
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
    const mediaCall = query.mock.calls.find(([text]) => String(text).includes("insert into media_objects"));
    const objectKeys = [
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ] as string[];

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "CONTENT_REJECTED" } });
    expect(JSON.stringify(query.mock.calls)).toContain("animal_detected");
    expect(query.mock.calls.some(([text]) => String(text).includes("insert into profiles"))).toBe(false);
    for (const objectKey of objectKeys) {
      await expect(readEncryptedMediaObject(app.config, objectKey)).rejects.toThrow();
    }

    await app.close();
  });

  it("publishes through Rekognition fallback when Stream returns a partial response", async () => {
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

    expect(response.statusCode, response.body).toBe(201);
    expect(sql.some((text) => text.includes("insert into media_objects"))).toBe(true);
    expect(sql.some((text) => text.includes("insert into profiles"))).toBe(true);
    expect(sql.some((text) => text.includes("insert into profile_photo_manual_reviews"))).toBe(false);
    expect(sql.some((text) => text.includes("delete from media_objects"))).toBe(false);
    expect(JSON.stringify(query.mock.calls)).toContain("rekognition_fallback");
    await Promise.all([
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ].map((objectKey) => deleteEncryptedMediaObject(app.config, objectKey as string)));

    await app.close();
  });

  it("publishes through Stream when Rekognition is unavailable", async () => {
    providerState.rekognitionError = Object.assign(new Error("Rekognition unavailable"), {
      name: "ServiceUnavailableException",
      $metadata: { httpStatusCode: 503, requestId: "rekognition-outage-1" }
    });
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
    expect(sql.some((text) => text.includes("insert into profiles"))).toBe(true);
    expect(sql.some((text) => text.includes("delete from media_objects"))).toBe(false);
    expect(JSON.stringify(query.mock.calls)).toContain("Rekognition unavailable");
    await Promise.all([
      mediaCall?.[1]?.[3],
      mediaCall?.[1]?.[14],
      mediaCall?.[1]?.[25]
    ].map((objectKey) => deleteEncryptedMediaObject(app.config, objectKey as string)));

    await app.close();
  });
});
