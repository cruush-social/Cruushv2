import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";

const EARTH_RADIUS_MILES = 3958.7613;
const BETA_LAUNCH_CENTER = {
  lat: 40.6828509,
  lng: -73.9521325
};
const BETA_LAUNCH_RADIUS_MILES = 50;

export type BetaAccessLocation = {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
};

function toRadians(degrees: number) {
  return degrees * Math.PI / 180;
}

export function distanceMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
