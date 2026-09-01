import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import { distanceMiles, NYC_SERVICE_AREA } from "./service-area.js";

export { distanceMiles } from "./service-area.js";

const BETA_LAUNCH_CENTER = NYC_SERVICE_AREA.center;
const BETA_LAUNCH_RADIUS_MILES = NYC_SERVICE_AREA.radiusMiles;

export type BetaAccessLocation = {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
};

export function isWithinBetaLaunchArea(location: { lat: number; lng: number }) {
  return distanceMiles(location, BETA_LAUNCH_CENTER) <= BETA_LAUNCH_RADIUS_MILES;
}

export function getBetaAccessConfig(config: AppConfig) {
  return {
    enabled: Boolean(config.BETA_ACCESS_GEOFENCE_ENABLED),
    center: BETA_LAUNCH_CENTER,
    radiusMiles: BETA_LAUNCH_RADIUS_MILES
  };
}

export function checkBetaAccess(config: AppConfig, location: BetaAccessLocation | null | undefined) {
  const access = getBetaAccessConfig(config);

  if (!access.enabled) {
    return {
      ...access,
      allowed: true,
      distanceMiles: null
    };
  }

  if (!location) {
    return {
      ...access,
      allowed: false,
      distanceMiles: null
    };
  }

  const distance = distanceMiles(location, access.center);

  return {
    ...access,
    allowed: distance <= access.radiusMiles,
    distanceMiles: distance
  };
}

export function assertBetaAccessAllowed(config: AppConfig, location: BetaAccessLocation | null | undefined) {
  const result = checkBetaAccess(config, location);

  if (!result.enabled) {
    return result;
  }

  if (!location) {
    throw new ApiError(
      403,
      "BETA_ACCESS_LOCATION_REQUIRED",
      "NYC open beta. Share location to continue."
    );
  }

  if (!result.allowed) {
    throw new ApiError(
      403,
      "BETA_ACCESS_OUTSIDE_RADIUS",
      "NYC open beta."
    );
  }

  return result;
}
