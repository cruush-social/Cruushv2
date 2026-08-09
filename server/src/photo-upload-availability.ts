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
    | "STREAM_MODERATION_ENABLED"
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
  const streamModerationReady =
    config.STREAM_MODERATION_ENABLED !== false;
  const streamImageBridgeReady =
    streamModerationReady &&
    config.STREAM_IMAGE_BRIDGE_ENABLED === true;
  const profilePhotoStreamReady =
    streamImageBridgeReady &&
    config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED === true;
  const messagePhotoStreamReady = streamImageBridgeReady;
  const rekognitionReady = config.PROFILE_PHOTO_REKOGNITION_ENABLED === true;
  // The moderation implementation needs both independent signals. Stream supplies
  // content policy; Rekognition supplies the face/age gate and the image fallback.
  // Reporting either scanner as sufficient made the UI offer an upload that the
  // server could not safely publish after the other check was reached.
  const deployedProfilePhotoSafetyReady =
    rekognitionReady && profilePhotoStreamReady;
  const deployedMessagePhotoSafetyReady =
    rekognitionReady && messagePhotoStreamReady;
  const alphaPhotoUploadBypass = activeAlphaPhotoUploadBypass(config);
  const profilePhotosAvailable =
    !deployed || deployedProfilePhotoSafetyReady || alphaPhotoUploadBypass;
  const messagePhotosAvailable =
    !deployed || deployedMessagePhotoSafetyReady || alphaPhotoUploadBypass;

  return {
    profilePhotos: profilePhotosAvailable,
    messagePhotos: messagePhotosAvailable
  };
}
