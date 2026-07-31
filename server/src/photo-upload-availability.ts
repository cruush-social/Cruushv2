import type { AppConfig } from "./config.js";

export function activeAlphaTest(config: Pick<AppConfig, "ALPHA_TEST_ENABLED" | "ALPHA_TEST_ENDS_AT">) {
  if (config.ALPHA_TEST_ENABLED !== true) {
    return false;
  }

  const endsAt = Date.parse(config.ALPHA_TEST_ENDS_AT ?? "");

  return !Number.isNaN(endsAt) && endsAt > Date.now();
}

export function photoUploadAvailability(
  config: Pick<
    AppConfig,
    | "NODE_ENV"
    | "STREAM_IMAGE_BRIDGE_ENABLED"
    | "PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED"
    | "PROFILE_PHOTO_REKOGNITION_ENABLED"
    | "ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED"
    | "ALPHA_TEST_ENABLED"
    | "ALPHA_TEST_ENDS_AT"
    | "PHOTODNA_ENABLED"
  >
) {
  const deployed = config.NODE_ENV === "production";
  const deployedSafetyReadyBeforePhotoDna =
    config.STREAM_IMAGE_BRIDGE_ENABLED === true &&
    config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true &&
    config.PROFILE_PHOTO_REKOGNITION_ENABLED === true;
  const deployedPhotoSafetyReady = deployedSafetyReadyBeforePhotoDna;

  return {
    profilePhotos: !deployed || deployedPhotoSafetyReady,
    messagePhotos: !deployed || deployedPhotoSafetyReady
  };
}
