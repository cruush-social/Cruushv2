import type { AppConfig } from "./config.js";

export function photoUploadAvailability(
  config: Pick<AppConfig, "NODE_ENV" | "STREAM_IMAGE_BRIDGE_ENABLED">
) {
  const deployed = config.NODE_ENV === "production";

  return {
    profilePhotos: !deployed || config.STREAM_IMAGE_BRIDGE_ENABLED === true,
    messagePhotos: !deployed
  };
}
