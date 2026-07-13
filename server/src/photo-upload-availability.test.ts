import { describe, expect, it } from "vitest";
import { photoUploadAvailability } from "./photo-upload-availability.js";

describe("deployed photo upload availability", () => {
  it("keeps public production profile uploads and all production message-photo uploads disabled", () => {
    expect(photoUploadAvailability({ NODE_ENV: "production", STREAM_IMAGE_BRIDGE_ENABLED: false })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("enables only profile photos on bridge-enabled staging and preserves local mock coverage", () => {
    expect(photoUploadAvailability({ NODE_ENV: "production", STREAM_IMAGE_BRIDGE_ENABLED: true })).toEqual({
      profilePhotos: true,
      messagePhotos: false
    });
    expect(photoUploadAvailability({ NODE_ENV: "test", STREAM_IMAGE_BRIDGE_ENABLED: false })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
  });
});
