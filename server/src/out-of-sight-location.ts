import { isWithinServiceArea } from "./service-area.js";
import {
  locationPayloadToCoordinates,
  type LocationPrivacyContext,
  type LocationPayload
} from "./location-privacy.js";
import { loadStoredOutOfSightStatuses } from "./oos-welcome-email.js";

export type OutOfSightStatus = "in_area" | "out_of_sight" | "unknown";
export type CoarseLocationLabelMode = "approximate" | "precise";

type Coordinates = { lat: number; lng: number };

/** The actual device coordinate, never a Mile High Club travel pin, owns this status. */
export function classifyOutOfSightLocation(coordinates: Coordinates | null | undefined): OutOfSightStatus {
  if (!coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
    return "unknown";
  }
  if (Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) {
    return "unknown";
  }
  return isWithinServiceArea(coordinates) ? "in_area" : "out_of_sight";
}

export function classifyCurrentOutOfSightLocation(
  location: LocationPayload | null | undefined,
  nowMs = Date.now()
): OutOfSightStatus {
  return classifyOutOfSightLocation(
    location && location.expiresAtMs > nowMs ? locationPayloadToCoordinates(location) : null
  );
}

/** Display-only last-known physical classification, never a map-access check. */
export async function loadOutOfSightStatuses(
  context: LocationPrivacyContext,
  userIds: string[]
): Promise<Map<string, OutOfSightStatus>> {
  return loadStoredOutOfSightStatuses(context, userIds);
}

/**
 * Only labels are returned. Unknown status never invents an in-area location,
 * and a missing city never falls back to a distance or precise coordinates.
 */
export function resolveOutOfSightLocationLabel(input: {
  viewerStatus: OutOfSightStatus;
  subjectStatus: OutOfSightStatus;
  sharedMode: CoarseLocationLabelMode;
  subjectCityLabel?: string | null;
}): string | null {
  if (input.viewerStatus === "out_of_sight" && input.subjectStatus === "in_area") {
    return input.sharedMode === "precise" ? "New York, NY" : "Among sinners";
  }
  if (input.subjectStatus === "out_of_sight") {
    return input.sharedMode === "precise" && input.subjectCityLabel?.trim()
      ? input.subjectCityLabel.trim()
      : "Far far away";
  }
  return null;
}
