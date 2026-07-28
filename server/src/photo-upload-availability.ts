import type { AppConfig } from "./config.js";

function stagingAlphaTestActive(
  config: Pick<AppConfig, "APP_DEPLOYMENT_STAGE" | "ALPHA_TEST_ENABLED" | "ALPHA_TEST_ENDS_AT">
) {
  if (config.APP_DEPLOYMENT_STAGE !== "staging" || config.ALPHA_TEST_ENABLED !== true) {
    return false;
  }

  const endsAt = Date.parse(config.ALPHA_TEST_ENDS_AT ?? "");

  return !Number.isNaN(endsAt) && endsAt > Date.now();
}

export function photoUploadAvailability(
  config: Pick<
    AppConfig,
    | "NODE_ENV"
    | "APP_DEPLOYMENT_STAGE"
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
  const deployedPhotoSafetyReady =
    deployedSafetyReadyBeforePhotoDna &&
    config.PHOTODNA_ENABLED === true;
  const alphaProfilePhotoSafetyReady =
    deployedSafetyReadyBeforePhotoDna &&
    (
      config.ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED === true ||
      stagingAlphaTestActive(config)
    );

  return {
    profilePhotos: !deployed || deployedPhotoSafetyReady || alphaProfilePhotoSafetyReady,
    messagePhotos: !deployed || deployedPhotoSafetyReady
  };
}
