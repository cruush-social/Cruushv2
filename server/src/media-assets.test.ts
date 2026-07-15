import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import type { PendingMediaAsset } from "./media-assets.js";
import { verifyMediaModerationInspectionSignature } from "./media-moderation-url.js";

const { moderateImage } = vi.hoisted(() => ({
  moderateImage: vi.fn()
}));

vi.mock("./moderation-provider.js", () => ({
  createModerationProvider: () => ({
    name: "stream",
    version: "test-version",
    moderateText: vi.fn(),
    moderateImage
  })
}));

import { moderatePendingMediaAsset } from "./media-assets.js";

const asset: PendingMediaAsset = {
  id: "59e01d61-4a76-4359-915a-1f25b7815ff4",
  ownerUserId: "6d4434e1-5fa3-4eeb-b2e2-593e07ef8788",
  surface: "message_photo",
  mimeType: "image/png",
  width: 640,
  height: 800,
  byteSize: 100,
  displayUrl: "/api/media/assets/59e01d61-4a76-4359-915a-1f25b7815ff4/display",
  thumbnailUrl: "/api/media/assets/59e01d61-4a76-4359-915a-1f25b7815ff4/thumbnail"
};
const signingSecret = "0123456789abcdef0123456789abcdef";

function testApp(configOverrides: Partial<AppConfig> = {}) {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const config = {
    NODE_ENV: "test",
    MODERATION_PROVIDER: "mock",
    MODERATION_TIMEOUT_MS: 5000,
    STREAM_MODERATION_ENABLED: true,
    STREAM_API_KEY: "stream-key",
    STREAM_API_SECRET: "stream-secret",
    STREAM_MODERATION_CONFIG_KEY: "cruush:automod",
    MEDIA_PUBLIC_BASE_URL: "https://api.cruush.test",
    MEDIA_MODERATION_URL_SECRET: signingSecret,
    MEDIA_MODERATION_URL_TTL_SECONDS: 120,
    PHOTODNA_ENABLED: false,
    ...configOverrides
  } as AppConfig;

  return {
    app: { config, db: { query } } as unknown as FastifyInstance,
    query
  };
}

describe("pending media moderation URLs", () => {
  beforeEach(() => {
    moderateImage.mockReset();
    moderateImage.mockResolvedValue({
      provider: "stream",
      provider_request_id: "stream-request-1",
      labels: [],
      latency_ms: 10,
      recommended_action: "keep",
      status: "complete"
    });
  });

  it("generates a signed inspection URL immediately before Stream submission", async () => {
    const { app, query } = testApp();

    await expect(moderatePendingMediaAsset(app, asset, {
      bytes: Buffer.from("image-bytes"),
      moderationSurface: "direct_message"
    })).resolves.toMatchObject({ id: asset.id });

    expect(moderateImage).toHaveBeenCalledTimes(1);
    const input = moderateImage.mock.calls[0]?.[0] as { imageUrl?: string };
    const url = new URL(input.imageUrl as string);
    const claims = {
      assetId: asset.id,
      method: "GET",
      variant: "display",
      purpose: url.searchParams.get("purpose") ?? "",
      expires: url.searchParams.get("expires") ?? "",
      signature: url.searchParams.get("signature") ?? ""
    };

    expect(url.origin).toBe("https://api.cruush.test");
    expect(url.pathname).toBe(`/api/media/moderation/${asset.id}/display`);
    expect(verifyMediaModerationInspectionSignature(app.config, claims)).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps mock moderation independent from public URL configuration", async () => {
    const { app } = testApp({
      STREAM_MODERATION_ENABLED: false,
      MEDIA_PUBLIC_BASE_URL: "",
      MEDIA_MODERATION_URL_SECRET: ""
    });

    await expect(moderatePendingMediaAsset(app, asset, {
      bytes: Buffer.from("image-bytes"),
      moderationSurface: "direct_message"
    })).resolves.toMatchObject({ id: asset.id });

    expect(moderateImage.mock.calls[0]?.[0]).toMatchObject({ imageUrl: undefined });
  });

  it("marks the asset failed when Stream URL generation is unavailable", async () => {
    const { app, query } = testApp({ MEDIA_MODERATION_URL_SECRET: "" });

    await expect(moderatePendingMediaAsset(app, asset, {
      bytes: Buffer.from("image-bytes"),
      moderationSurface: "direct_message"
    })).rejects.toMatchObject({
      statusCode: 503,
      code: "MODERATION_UNAVAILABLE"
    });

    expect(moderateImage).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("media.moderation_status = 'pending'");
    expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([asset.id, "failed"]));
  });
});
