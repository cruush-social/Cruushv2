import { describe, expect, it } from "vitest";
import { photoUploadAvailability } from "./photo-upload-availability.js";

const productionConfig = {
  NODE_ENV: "production" as const,
  APP_DEPLOYMENT_STAGE: "production" as const,
  STREAM_IMAGE_BRIDGE_ENABLED: false,
  PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false,
  PROFILE_PHOTO_REKOGNITION_ENABLED: false,
  ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED: false,
  ALPHA_TEST_ENABLED: false,
  ALPHA_TEST_ENDS_AT: "",
  PHOTODNA_ENABLED: false
};

describe("smoke: either production photo scanner preserves upload availability", () => {
  it("keeps uploads available when Rekognition alone is configured", () => {
    expect(photoUploadAvailability({
      ...productionConfig,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
  });

  it("keeps uploads available when the Stream stack alone is configured", () => {
    expect(photoUploadAvailability({
      ...productionConfig,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
  });

  it("keeps uploads disabled when no scanner is configured at all", () => {
    expect(photoUploadAvailability(productionConfig)).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });
});
