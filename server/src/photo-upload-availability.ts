import type { AppConfig } from "./config.js";

export function photoUploadAvailability(
  config: Pick<
    AppConfig,
    | "NODE_ENV"
    | "STREAM_IMAGE_BRIDGE_ENABLED"
    | "PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED"
    | "PROFILE_PHOTO_REKOGNITION_ENABLED"
    | "PHOTODNA_ENABLED"
  >
) {
  const deployed = config.NODE_ENV === "production";
  const deployedPhotoSafetyReady =
    config.STREAM_IMAGE_BRIDGE_ENABLED === true &&
    config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true &&
    config.PROFILE_PHOTO_REKOGNITION_ENABLED === true &&
    config.PHOTODNA_ENABLED === true;

  return {
    profilePhotos: !deployed || deployedPhotoSafetyReady,
    messagePhotos: !deployed || deployedPhotoSafetyReady
  };
}
