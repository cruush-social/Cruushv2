import { describe, expect, it, vi } from "vitest";
import {
  buildStreamImageCheckRequest,
  MockModerationProvider,
  normalizeStreamLabel,
  streamLabelsFromResponse,
} from "./moderation-provider.js";
import {
  configureStreamProfilePhotoPolicy,
  STREAM_PROFILE_PHOTO_IMAGE_POLICY,
} from "./stream-profile-photo-policy.js";

describe("NSFW Photo Moderation, AWS Rekognition, Stream AutoMod Suite", () => {
  describe("1. Rekognition & Stream Image Label Normalization", () => {
    it("maps Rekognition and Stream explicit nudity labels to normalized categories", () => {
      const explicitLabel = normalizeStreamLabel("Explicit Nudity");
      expect(explicitLabel).toBe("adult_nudity");

      const sexualLabel = normalizeStreamLabel("Sexual Activity");
      expect(sexualLabel).toBe("adult_explicit");
    });

    it("maps suggestive and partial nudity labels", () => {
      const nudeLabel = normalizeStreamLabel("Non Explicit Nudity");
      expect(nudeLabel).toBe("adult_nudity");

      const swimwearLabel = normalizeStreamLabel("Swimwear");
      expect(swimwearLabel).toBe("adult_nudity");
    });

    it("extracts and normalizes moderation labels from Rekognition/Stream response flags", () => {
      const mockResponse = {
        recommended_action: "flag",
        item: {
          flags: [
            { type: "Explicit Nudity", reason: "Explicit Nudity", labels: ["Explicit Nudity"] },
          ],
        },
      };

      const labels = streamLabelsFromResponse(mockResponse as never);
      expect(labels).toHaveLength(1);
      expect(labels[0].normalized_label).toBe("adult_nudity");
    });

    it("formats payload request correctly for Stream/Rekognition image check API", () => {
      const input = {
        userId: "user-test-1",
        surface: "profile" as const,
        contentId: "img-123",
        imageUrl: "https://cdn.cruush.app/photos/test.jpg",
        pseudonymKey: "test-pseudonym-secret",
        configKey: "cruush:automod",
      };

      const req = buildStreamImageCheckRequest(input);
      expect(req.moderation_payload.images).toEqual(["https://cdn.cruush.app/photos/test.jpg"]);
      expect(req.config_key).toBe("cruush:automod");
      expect(req.options.force_sync).toBe(true);
    });
  });

  describe("2. Mock Moderation Provider Image Checks", () => {
    it("processes safe profile photo uploads cleanly", async () => {
      const provider = new MockModerationProvider();
      const result = await provider.moderateImage({
        userId: "user-1",
        surface: "profile",
        mimeType: "image/jpeg",
        filename: "portrait.jpg",
        imageUrl: "https://cdn.cruush.app/photos/safe.jpg",
        bytes: Buffer.from("safe-image-bytes"),
      });

      expect(result.provider).toBe("mock");
      expect(result.labels).toEqual([]);
      expect(result.status).toBe("completed");
    });
  });

  describe("3. Stream Profile Photo AutoMod Policy Sync", () => {
    it("defines explicit policy rules for Stream AI image configuration", () => {
      expect(STREAM_PROFILE_PHOTO_IMAGE_POLICY).toBeDefined();
      expect(STREAM_PROFILE_PHOTO_IMAGE_POLICY.enabled).toBe(true);
      expect(Array.isArray(STREAM_PROFILE_PHOTO_IMAGE_POLICY.rules)).toBe(true);
    });

    it("configures Stream client AutoMod policy without overriding non-image engines", async () => {
      const currentConfig = {
        key: "cruush:automod",
        team: "cruush",
        async: true,
        created_at: new Date(),
        updated_at: new Date(),
        ai_text_config: { enabled: true, rules: [] },
        block_list_config: { enabled: true, rules: [] },
        google_vision_config: { enabled: true, rules: [] },
        llm_config: { enabled: true, rules: [] },
      };

      const getConfig = vi.fn().mockResolvedValue({ config: currentConfig });
      const upsertConfig = vi.fn().mockResolvedValue({
        config: { ...currentConfig, ai_image_config: STREAM_PROFILE_PHOTO_IMAGE_POLICY },
      });

      const mockStreamClient = {
        moderation: {
          getConfig,
          upsertConfig,
        },
      };

      await configureStreamProfilePhotoPolicy(mockStreamClient as never, "cruush:automod");

      expect(getConfig).toHaveBeenCalledWith({ key: "cruush:automod" });
      expect(upsertConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "cruush:automod",
          ai_image_config: STREAM_PROFILE_PHOTO_IMAGE_POLICY,
        })
      );
    });
  });
});
