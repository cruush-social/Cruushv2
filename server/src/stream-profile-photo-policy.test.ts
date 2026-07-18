import { describe, expect, it, vi } from "vitest";
import {
  configureStreamProfilePhotoPolicy,
  STREAM_PROFILE_PHOTO_IMAGE_POLICY
} from "./stream-profile-photo-policy.js";

describe("Stream profile-photo policy configurator", () => {
  it("does not auto-remove permitted adult nudity", () => {
    expect(STREAM_PROFILE_PHOTO_IMAGE_POLICY.rules).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Explicit", action: "remove" }),
      expect.objectContaining({ label: "Non-Explicit Nudity", action: "remove" })
    ]));
  });

  it("replaces the image rules while preserving every exposed non-image engine", async () => {
    const current = {
      key: "cruush:automod",
      team: "cruush",
      async: true,
      created_at: new Date(),
      updated_at: new Date(),
      supported_video_call_harm_types: [],
      ai_text_config: { enabled: true, rules: [] },
      block_list_config: { enabled: true, rules: [] },
      google_vision_config: { enabled: true, rules: [] },
      llm_config: { enabled: true, rules: [] }
    };
    const getConfig = vi.fn().mockResolvedValue({ config: current, duration: "1ms" });
    const upsertConfig = vi.fn().mockResolvedValue({
      config: { ...current, ai_image_config: STREAM_PROFILE_PHOTO_IMAGE_POLICY },
      duration: "1ms"
    });
    const client = { moderation: { getConfig, upsertConfig } };

    await configureStreamProfilePhotoPolicy(client as never, "cruush:automod");

    expect(getConfig).toHaveBeenCalledWith({ key: "cruush:automod" });
    expect(upsertConfig).toHaveBeenCalledWith(expect.objectContaining({
      key: "cruush:automod",
      team: "cruush",
      async: false,
      ai_image_config: STREAM_PROFILE_PHOTO_IMAGE_POLICY,
      ai_text_config: current.ai_text_config,
      block_list_config: current.block_list_config,
      google_vision_config: current.google_vision_config,
      llm_config: current.llm_config
    }));
  });

  it("refuses to create a new config that could omit existing policy engines", async () => {
    const client = {
      moderation: {
        getConfig: vi.fn().mockResolvedValue({ config: undefined, duration: "1ms" }),
        upsertConfig: vi.fn()
      }
    };

    await expect(configureStreamProfilePhotoPolicy(client as never, "missing"))
      .rejects.toThrow("was not found");
    expect(client.moderation.upsertConfig).not.toHaveBeenCalled();
  });
});
