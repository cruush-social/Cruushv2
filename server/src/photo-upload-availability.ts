import type { AppConfig } from "./config.js";

export function activeAlphaTest(config: Pick<AppConfig, "ALPHA_TEST_ENABLED" | "ALPHA_TEST_ENDS_AT">) {
  if (config.ALPHA_TEST_ENABLED !== true) {
    return false;
  }

  const endsAt = Date.parse(config.ALPHA_TEST_ENDS_AT ?? "");

  return !Number.isNaN(endsAt) && endsAt > Date.now();
}

export function activeAlphaPhotoUploadBypass(
  config: Pick<AppConfig, "ALPHA_TEST_ENABLED" | "ALPHA_TEST_ENDS_AT">
) {
  return activeAlphaTest(config);
}

export function activeAlphaProfilePhotoUploadBypass(
  config: Pick<AppConfig, "ALPHA_TEST_ENABLED" | "ALPHA_TEST_ENDS_AT">
) {
  return activeAlphaPhotoUploadBypass(config);
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
  const streamSafetyReady =
    config.STREAM_IMAGE_BRIDGE_ENABLED === true &&
    config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true;
  // Rekognition alone is enough to open uploads. It backs Stream up when Stream is
  // unconfigured or failing, so requiring both left uploads switched off in production.
  const deployedSafetyReadyBeforePhotoDna =
    config.PROFILE_PHOTO_REKOGNITION_ENABLED === true || streamSafetyReady;
  const alphaPhotoUploadBypass = activeAlphaPhotoUploadBypass(config);
  const photosAvailable = !deployed || deployedSafetyReadyBeforePhotoDna || alphaPhotoUploadBypass;

  return {
    profilePhotos: photosAvailable,
    messagePhotos: photosAvailable
  };
}
