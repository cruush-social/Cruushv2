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

describe("smoke: photo uploads stay switched on in production", () => {
  it("enables uploads when Rekognition alone is configured", () => {
    // This is the exact production shape that had uploads switched off: Stream is not
    // configured, the alpha test is over, and Rekognition is the only live scanner.
    expect(photoUploadAvailability({
      ...productionConfig,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
  });

  it("enables uploads when the Stream stack alone is configured", () => {
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
