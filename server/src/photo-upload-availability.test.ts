import { describe, expect, it } from "vitest";
import { photoUploadAvailability } from "./photo-upload-availability.js";

const baseConfig = {
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
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: false,
      PHOTODNA_ENABLED: true
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("keeps uploads closed when the non-PhotoDNA safety gates are incomplete", () => {
    expect(photoUploadAvailability({
      ...baseConfig,
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });

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

  it("allows active alpha-test uploads without PhotoDNA after the automated safety layers are ready", () => {
    expect(photoUploadAvailability({
      ...baseConfig,
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
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
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
