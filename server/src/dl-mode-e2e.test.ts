import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// End-to-end cover for the chain DL Mode depends on, with only the AWS network
// boundary faked:
//
//   upload -> Rekognition DetectModerationLabels -> explicit_classification
//   -> every read endpoint returning photo_explicit -> client masks
//
// Four separate breakages made DL Mode look dead in production at once. Each
// assertion below pins one of them so a regression fails here instead of
// shipping as "NSFW photos still visible".

const rekognitionState = vi.hoisted(() => ({
  moderationLabels: [] as Array<{ Name: string; ParentName?: string; Confidence: number }>,
  labels: [{ Name: "Person", Confidence: 99, Parents: [] as Array<{ Name: string }> }],
  faces: [{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }],
  detectModerationLabelsCalls: 0,
  throwOnModeration: null as Error | null
}));

vi.mock("@aws-sdk/client-rekognition", () => ({
  DetectLabelsCommand: class DetectLabelsCommand { constructor(readonly input: unknown) {} },
  DetectFacesCommand: class DetectFacesCommand { constructor(readonly input: unknown) {} },
  DetectModerationLabelsCommand: class DetectModerationLabelsCommand { constructor(readonly input: unknown) {} },
  RekognitionClient: class RekognitionClient {
    async send(command: { constructor: { name: string } }) {
      if (command.constructor.name === "DetectFacesCommand") {
        return { FaceDetails: rekognitionState.faces, $metadata: { requestId: "faces-1" } };
      }

      if (command.constructor.name === "DetectModerationLabelsCommand") {
        rekognitionState.detectModerationLabelsCalls += 1;

        if (rekognitionState.throwOnModeration) {
          throw rekognitionState.throwOnModeration;
        }

        return { ModerationLabels: rekognitionState.moderationLabels, $metadata: { requestId: "moderation-1" } };
      }

      return { Labels: rekognitionState.labels, $metadata: { requestId: "labels-1" } };
    }
  }
}));

// No Stream credentials anywhere: this is the production shape that was broken.
// Rekognition has to carry the classification on its own.
vi.mock("./moderation-provider.js", () => ({
  // Both factories resolve to the same stub: production calls the OrUnavailable variant.
  createModerationProviderOrUnavailable: () => moderationProviderStub(),
  createModerationProvider: () => moderationProviderStub()
}));

function moderationProviderStub() {
  return ({
    name: "mock",
    version: "test",
    moderateText: vi.fn(),
    moderateImage: vi.fn(async () => ({
      provider: "mock",
      provider_request_id: "mock-1",
      labels: [],
      latency_ms: 1,
      status: "completed",
      recommended_action: "keep",
      raw_result: {}
    }))
  });
}

import { buildServer } from "./app.js";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { deleteEncryptedMediaObject } from "./media-storage.js";
import { createMemoryRateLimiter } from "./rate-limit.js";

const userId = "d271f6da-c51d-4d73-a322-d9c56f45d4fa";

const validPng = () => Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function multipartFilePayload(content: Buffer) {
  const boundary = `----cruush-dl-mode-${randomUUID()}`;
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
    APP_DEPLOYMENT_STAGE: "production",
    PORT: 3001,
    HOST: "127.0.0.1",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cruush",
    CORS_ORIGIN: "http://localhost:5173",
    SESSION_SECRET: "test-secret",
    APP_URL: "https://cruush.test",
    MEDIA_PUBLIC_BASE_URL: "https://api.cruush.test",
    MEDIA_MODERATION_URL_SECRET: "0123456789abcdef0123456789abcdef",
    MEDIA_MODERATION_URL_TTL_SECONDS: 120,
    MEDIA_STORAGE_DIR: join(tmpdir(), `cruush-dl-mode-${randomUUID()}`),
    MEDIA_OBJECT_STORAGE_DRIVER: "local",
    // The production shape that was broken: Stream entirely absent, Rekognition
    // expected to classify on its own.
    STREAM_MODERATION_ENABLED: false,
    STREAM_IMAGE_BRIDGE_ENABLED: false,
    PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false,
    PROFILE_PHOTO_REKOGNITION_ENABLED: true,
    PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
    PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
    PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
    PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
    PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18,
    PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000,
    HUMAN_MODERATION_ENABLED: false,
    BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: false,
    MEDIA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    MEDIA_ENCRYPTION_KEY_VERSION: "v1"
  } as AppConfig;
  const app = buildServer(config, {
    db: { query, end } as unknown as DbClient,
    rateLimiter: createMemoryRateLimiter()
  });

  return { app, config, query };
}

async function uploadProfilePhoto(app: ReturnType<typeof createTestApp>["app"]) {
  const multipart = multipartFilePayload(validPng());

  return app.inject({
    method: "POST",
    url: "/api/profile-photos",
    headers: {
      "x-user-id": userId,
      "content-type": multipart.contentType
    },
    payload: multipart.payload
  });
}

async function cleanup(app: ReturnType<typeof createTestApp>["app"], query: ReturnType<typeof createTestApp>["query"]) {
  const mediaCall = query.mock.calls.find(([text]) => String(text).includes("insert into media_objects"));
  await app.close();
  await Promise.all([
    mediaCall?.[1]?.[3],
    mediaCall?.[1]?.[14],
    mediaCall?.[1]?.[25]
  ].map((objectKey) => objectKey ? deleteEncryptedMediaObject(app.config, objectKey as string) : undefined));
}

describe("DL Mode end to end", () => {
  beforeEach(() => {
    rekognitionState.moderationLabels = [];
    rekognitionState.labels = [{ Name: "Person", Confidence: 99, Parents: [] }];
    rekognitionState.faces = [{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }];
    rekognitionState.detectModerationLabelsCalls = 0;
    rekognitionState.throwOnModeration = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("classifies a nude profile photo as explicit with Stream absent", async () => {
    rekognitionState.moderationLabels = [
      { Name: "Explicit Nudity", ParentName: "", Confidence: 97 }
    ];
    const { app, query } = createTestApp();

    const response = await uploadProfilePhoto(app);

    // Adult nudity is allowed on profiles - it must publish, not be rejected.
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ data: { explicit: true } });

    // The stored classification is what every DL Mode surface reads from.
    const persisted = JSON.stringify(query.mock.calls);
    expect(persisted).toContain("explicit_classification");

    // Rekognition is the only classifier configured, so it must have been asked.
    expect(rekognitionState.detectModerationLabelsCalls).toBeGreaterThan(0);

    await cleanup(app, query);
  });

  it("leaves an ordinary profile photo unclassified so DL Mode does not over-mask", async () => {
    rekognitionState.moderationLabels = [];
    const { app, query } = createTestApp();

    const response = await uploadProfilePhoto(app);

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ data: { explicit: false } });

    await cleanup(app, query);
  });

  it("rejects rather than publishing blind when every classifier is unreachable", async () => {
    rekognitionState.throwOnModeration = new Error("AccessDeniedException: not authorized to perform rekognition:DetectModerationLabels");
    const { app, query } = createTestApp();

    const response = await uploadProfilePhoto(app);

    // A total outage returns no labels, so adult nudity - which this app allows -
    // cannot be told apart from an animal, gore, or a hate symbol, which it never
    // allows. Publishing blind would admit all of them and would also skip the
    // adult-human gate on profile photos. Rejecting is recoverable; a published
    // hate symbol is not.
    expect(response.statusCode, response.body).not.toBe(201);

    await cleanup(app, query);
  });

  it("still rejects a non-human photo when the classifier is working", async () => {
    // The lenient path is for adult nudity only. Everything else stays rejected
    // whether or not Rekognition is reachable.
    rekognitionState.labels = [{ Name: "Dog", Confidence: 98, Parents: [{ Name: "Animal" }] }];
    rekognitionState.faces = [];
    rekognitionState.moderationLabels = [];
    const { app, query } = createTestApp();

    const response = await uploadProfilePhoto(app);

    expect(response.statusCode, response.body).not.toBe(201);

    await cleanup(app, query);
  });
});
