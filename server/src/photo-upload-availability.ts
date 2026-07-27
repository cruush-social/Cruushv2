import type { AppConfig } from "./config.js";

export function photoUploadAvailability(
  config: Pick<
    AppConfig,
    | "NODE_ENV"
    | "STREAM_IMAGE_BRIDGE_ENABLED"
    | "PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED"
    | "PROFILE_PHOTO_REKOGNITION_ENABLED"
    | "ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED"
    | "PHOTODNA_ENABLED"
  >
) {
  const deployed = config.NODE_ENV === "production";
  const deployedSafetyReadyBeforePhotoDna =
    config.STREAM_IMAGE_BRIDGE_ENABLED === true &&
    config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true &&
    config.PROFILE_PHOTO_REKOGNITION_ENABLED === true;
  const deployedPhotoSafetyReady =
    deployedSafetyReadyBeforePhotoDna &&
    config.PHOTODNA_ENABLED === true;
  const alphaProfilePhotoSafetyReady =
    deployedSafetyReadyBeforePhotoDna &&
    config.ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED === true;

  return {
    profilePhotos: !deployed || deployedPhotoSafetyReady || alphaProfilePhotoSafetyReady,
    messagePhotos: !deployed || deployedPhotoSafetyReady
  };
}
