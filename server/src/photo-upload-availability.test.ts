import { describe, expect, it } from "vitest";
import { photoUploadAvailability } from "./photo-upload-availability.js";

describe("deployed photo upload availability", () => {
  it("keeps public production profile uploads and all production message-photo uploads disabled", () => {
    expect(photoUploadAvailability({
      NODE_ENV: "production",
      STREAM_IMAGE_BRIDGE_ENABLED: false,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false,
      PROFILE_PHOTO_REKOGNITION_ENABLED: false,
      PHOTODNA_ENABLED: false
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("enables deployed profile photos only when every strict safety gate is configured", () => {
    expect(photoUploadAvailability({
      NODE_ENV: "production",
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      PHOTODNA_ENABLED: true
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
    expect(photoUploadAvailability({
      NODE_ENV: "production",
      STREAM_IMAGE_BRIDGE_ENABLED: true,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      PHOTODNA_ENABLED: false
    })).toEqual({
      profilePhotos: false,
      messagePhotos: false
    });
  });

  it("preserves local mock upload coverage", () => {
    expect(photoUploadAvailability({
      NODE_ENV: "test",
      STREAM_IMAGE_BRIDGE_ENABLED: false,
      PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: false,
      PROFILE_PHOTO_REKOGNITION_ENABLED: false,
      PHOTODNA_ENABLED: false
    })).toEqual({
      profilePhotos: true,
      messagePhotos: true
    });
  });
});
