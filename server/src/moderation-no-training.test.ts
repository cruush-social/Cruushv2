import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { createModerationProvider, StreamModerationProvider } from "./moderation-provider.js";
import { moderateImageOrReject, moderateTextOrReject } from "./moderation-service.js";
import { checkPhotoDna } from "./photodna.js";
import { detectImageChildFaces, detectProfilePhotoHuman, detectPublicImageSafety } from "./profile-photo-human-detection.js";

const { streamCheck, streamTask, awsSend } = vi.hoisted(() => ({ streamCheck: vi.fn(), streamTask: vi.fn(), awsSend: vi.fn() }));
vi.mock("@stream-io/node-sdk", () => ({ StreamClient: class {
  moderation = { check: streamCheck };
  getTask = streamTask;
} }));
vi.mock("@aws-sdk/client-rekognition", async importOriginal => ({
  ...await importOriginal<typeof import("@aws-sdk/client-rekognition")>(),
  RekognitionClient: class { send = awsSend; },
}));

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const config = {
  NODE_ENV: "production", MODERATION_PROVIDER: "mock", MODERATION_TIMEOUT_MS: 5000,
  STREAM_MODERATION_ENABLED: true, STREAM_API_KEY: "synthetic-key", STREAM_API_SECRET: "synthetic-secret",
  STREAM_MODERATION_CONFIG_KEY: "synthetic-no-training", STREAM_PSEUDONYM_KEY: "synthetic-pseudonym-key",
  PROFILE_PHOTO_REKOGNITION_ENABLED: true, PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
  PHOTODNA_ENABLED: true, PHOTODNA_API_URL: "https://fixture.example.invalid", PHOTODNA_OPERATION_PATH: "/match",
  PHOTODNA_SUBSCRIPTION_KEY: "synthetic-fixture-key", PHOTODNA_TIMEOUT_MS: 5000,
} as AppConfig;
const imageInput = { userId: "fixture-user", surface: "profile_photo" as const, mimeType: "image/png",
  bytes: image, imageUrl: "https://fixture.example.invalid/member-photo" };

beforeEach(() => {
  vi.resetAllMocks();
  streamCheck.mockResolvedValue({ status: "complete", recommended_action: "keep" });
  awsSend.mockImplementation(async command => {
    if (command.constructor.name === "DetectFacesCommand") return { FaceDetails: [{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }] };
    if (command.constructor.name === "DetectLabelsCommand") return { Labels: [{ Name: "Person", Confidence: 99 }] };
    if (command.constructor.name === "DetectTextCommand") return { TextDetections: [] };
    return { ModerationLabels: [] };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("no-training content export guard", () => {
  it.each([undefined, false])("blocks Stream text, images, and task resumption with approval %s", async verified => {
    const unapproved = { ...config, STREAM_NO_AI_TRAINING_VERIFIED: verified };
    const provider = new StreamModerationProvider(unapproved);
    await expect(provider.moderateText({ userId: "fixture-user", surface: "feed", text: "private member text" })).resolves.toMatchObject({ status: "error" });
    await expect(provider.moderateImage(imageInput)).resolves.toMatchObject({ status: "error" });
    await expect(provider.moderateImage({ ...imageInput, providerTaskId: "existing-task" })).resolves.toMatchObject({ status: "error" });
    await expect(createModerationProvider(unapproved).moderateImage(imageInput)).resolves.toMatchObject({ status: "error" });
    expect(streamCheck).not.toHaveBeenCalled();
    expect(streamTask).not.toHaveBeenCalled();
  });

  it("runs Stream text and image checks only after explicit verified approval", async () => {
    const provider = createModerationProvider({ ...config, STREAM_NO_AI_TRAINING_VERIFIED: true });
    await provider.moderateText({ userId: "fixture-user", surface: "feed", text: "synthetic approved text" });
    await provider.moderateImage(imageInput);
    expect(streamCheck).toHaveBeenCalledTimes(2);
    expect(streamCheck.mock.calls[0][0].moderation_payload).toEqual({ texts: ["synthetic approved text"] });
    expect(streamCheck.mock.calls[1][0].moderation_payload).toEqual({ images: [imageInput.imageUrl] });
  });

  it.each([detectImageChildFaces, detectProfilePhotoHuman, detectPublicImageSafety])("blocks every Rekognition image path without verified opt-out", async detector => {
    for (const verified of [undefined, false]) {
      await expect(detector({ ...config, REKOGNITION_NO_AI_TRAINING_VERIFIED: verified }, image)).resolves.toMatchObject({ status: "error" });
    }
    expect(awsSend).not.toHaveBeenCalled();
    await expect(detector({ ...config, REKOGNITION_NO_AI_TRAINING_VERIFIED: true }, image)).resolves.toMatchObject({ status: "complete" });
    expect(awsSend).toHaveBeenCalled();
    expect(awsSend.mock.calls.every(([command]) => Buffer.isBuffer(command.input.Image.Bytes))).toBe(true);
  });

  it("blocks PhotoDNA fetch without verified terms and permits the approved synthetic check", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isMatch: false }) });
    vi.stubGlobal("fetch", fetchMock);
    for (const verified of [undefined, false]) {
      await expect(checkPhotoDna({ ...config, PHOTODNA_NO_AI_TRAINING_VERIFIED: verified }, image)).rejects.toThrow(/not been verified/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(checkPhotoDna({ ...config, PHOTODNA_NO_AI_TRAINING_VERIFIED: true }, image)).resolves.toMatchObject({ status: "allowed" });
    expect(fetchMock).toHaveBeenCalledWith("https://fixture.example.invalid/match", expect.objectContaining({ body: image }));
  });

  it.each(["profile_photo", "direct_message", "group_message", "feed"] as const)("rejects unscreened %s images even with alpha bypass enabled", async surface => {
    const app = { config: { ...config, ALPHA_TEST_ENABLED: true, ALPHA_TEST_ENDS_AT: "2099-01-01T00:00:00Z" },
      db: { query: vi.fn().mockResolvedValue({ rows: [] }) }, log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance;
    await expect(moderateImageOrReject(app, { ...imageInput, surface })).rejects.toMatchObject({ statusCode: 503, code: "MODERATION_UNAVAILABLE" });
    expect(streamCheck).not.toHaveBeenCalled();
    expect(awsSend).not.toHaveBeenCalled();
  });

  it("uses approved Rekognition fallback while withholding the image from unapproved Stream", async () => {
    const app = { config: { ...config, STREAM_NO_AI_TRAINING_VERIFIED: false, REKOGNITION_NO_AI_TRAINING_VERIFIED: true },
      db: { query: vi.fn().mockResolvedValue({ rows: [] }) }, log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance;
    await expect(moderateImageOrReject(app, imageInput)).resolves.toMatchObject({ decision: { decision: "allow" } });
    expect(streamCheck).not.toHaveBeenCalled();
    expect(awsSend).toHaveBeenCalledTimes(3);
  });

  it("rejects production mock-only images rather than treating synthetic labels as a real safety check", async () => {
    const app = { config: { ...config, STREAM_MODERATION_ENABLED: false, PROFILE_PHOTO_REKOGNITION_ENABLED: false },
      db: { query: vi.fn().mockResolvedValue({ rows: [] }) }, log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance;
    await expect(moderateImageOrReject(app, imageInput)).rejects.toMatchObject({ statusCode: 503, code: "MODERATION_UNAVAILABLE" });
    expect(streamCheck).not.toHaveBeenCalled();
    expect(awsSend).not.toHaveBeenCalled();
  });

  it("keeps local text safety when Stream exports are blocked", async () => {
    const app = { config, db: { query: vi.fn().mockResolvedValue({ rows: [] }) },
      log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance;
    await expect(moderateTextOrReject(app, { userId: "fixture-user", surface: "feed", text: "hello everyone" })).resolves.toMatchObject({ decision: { decision: "allow" } });
    await expect(moderateTextOrReject(app, { userId: "fixture-user", surface: "feed", text: "I am going to hurt you" })).rejects.toMatchObject({ code: "CONTENT_REJECTED" });
    expect(streamCheck).not.toHaveBeenCalled();
  });
});
