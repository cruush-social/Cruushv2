import { describe, expect, it } from "vitest";
import { photoUploadAvailability } from "./photo-upload-availability.js";

const baseConfig = {
  NODE_ENV: "production" as const,
  APP_DEPLOYMENT_STAGE: "production" as const,
  STREAM_MODERATION_ENABLED: false,
  STREAM_IMAGE_BRIDGE_ENABLED: false,
  PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false,
  PROFILE_PHOTO_REKOGNITION_ENABLED: false,
  ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED: false,
  ALPHA_TEST_ENABLED: false,
  ALPHA_TEST_ENDS_AT: "",
  PHOTODNA_ENABLED: false
};

describe("deployed photo upload availability", () => {
  it("keeps public production profile uploads and all production message-photo uploads disabled", () => {
    expect(photoUploadAvailability({
      ...baseConfig
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("enables deployed photos when the non-PhotoDNA safety gates are configured", () => {
    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_MODERATION_ENABLED: true,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
    // Stream must be paired with Rekognition: profile gate and image fallback use both.
    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_MODERATION_ENABLED: true,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: false,
      PHOTODNA_ENABLED: true
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("opens message photos when the shared Stream image bridge is ready before profile-photo automod", () => {
    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_MODERATION_ENABLED: true,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false,
      PROFILE_PHOTO_REKOGNITION_ENABLED: false
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("keeps uploads closed when either scanner is configured on its own", () => {
    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_MODERATION_ENABLED: true,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });

    // Rekognition alone cannot satisfy Stream's image moderation path.
    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED: true
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("allows profile and message photo uploads during the active alpha test even before PhotoDNA is ready", () => {
    expect(photoUploadAvailability({
      ...baseConfig,
      ALPHA_TEST_ENABLED: true,
      ALPHA_TEST_ENDS_AT: "2099-07-28T23:59:00-04:00"
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });

    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_MODERATION_ENABLED: true,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      ALPHA_TEST_ENABLED: true,
      ALPHA_TEST_ENDS_AT: "2099-07-28T23:59:00-04:00"
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });

    expect(photoUploadAvailability({
      ...baseConfig,
      ALPHA_TEST_ENABLED: true,
      ALPHA_TEST_ENDS_AT: "2020-07-28T23:59:00-04:00"
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("preserves local mock upload coverage", () => {
    expect(photoUploadAvailability({
      ...baseConfig,
      NODE_ENV: "test"
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
  });
});
