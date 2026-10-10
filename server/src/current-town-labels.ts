import {
  loadLocationEnvelopes, locationPayloadToCoordinates, type LocationPrivacyContext
} from "./location-privacy.js";
import { MAX_TOWN_LOOKUP_POINTS, TownBoundaryLookup } from "./town-boundary-lookup.js";

export type CurrentTownLabelContext = LocationPrivacyContext & {
  config: { TOWN_BOUNDARY_DATABASE_PATH?: string };
};

// Only public boundary geometry is cached by the worker, never members or fixes.
let current: { path: string; lookup: TownBoundaryLookup } | undefined;

export async function closeCurrentTownLookup(): Promise<void> {
  const previous = current;
  current = undefined;
  await previous?.lookup.close();
}

/** Caller must first filter subject IDs through the existing privacy authorization. */
export async function loadCurrentTownLabels(
  context: CurrentTownLabelContext,
  userIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const databasePath = context.config.TOWN_BOUNDARY_DATABASE_PATH?.trim();
  if (!databasePath || !userIds.length) return result;
  // Bound both the database read and the private coordinates crossing to the worker.
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of userIds) {
    if (!seen.has(id)) { ids.push(id); seen.add(id); }
    if (ids.length === MAX_TOWN_LOOKUP_POINTS) break;
  }
  try {
    const locations = await loadLocationEnvelopes(context, ids);
    const now = Date.now();
    const subjects = ids.flatMap((id) => {
      const location = locations.get(id);
      if (!location || location.source !== "GPS" || !Number.isFinite(location.expiresAtMs)
        || location.expiresAtMs <= now) return [];
      const point = locationPayloadToCoordinates(location);
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)
        || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return [];
      return [{ id, point, expiresAtMs: location.expiresAtMs }];
    });
    if (!subjects.length) return result;
    if (!current || current.path !== databasePath) {
      const previous = current;
      current = { path: databasePath, lookup: new TownBoundaryLookup(databasePath) };
      // Publish synchronously so concurrent first callers cannot create orphan workers.
      void previous?.lookup.close();
    }
    const labels = await current.lookup.lookup(subjects.map((subject) => subject.point));
    subjects.forEach((subject, index) => {
      const label = labels[index];
      if (label && subject.expiresAtMs > Date.now()) result.set(subject.id, label);
    });
  } catch {
    // Missing/unreadable envelopes, disabled/invalid data or worker failure stay unknown.
  }
  return result;
}

/** Caller must authorize the subject and reciprocal Precise mode before lookup. */
export async function loadTravelPinTownLabel(
  context: CurrentTownLabelContext,
  pin: { latitude: number; longitude: number; expiresAtMs: number },
): Promise<string | null> {
  const databasePath = context.config.TOWN_BOUNDARY_DATABASE_PATH?.trim();
  if (!databasePath || pin.expiresAtMs <= Date.now()
    || !Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)
    || Math.abs(pin.latitude) > 90 || Math.abs(pin.longitude) > 180) return null;
  try {
    if (!current || current.path !== databasePath) {
      const previous = current;
      current = { path: databasePath, lookup: new TownBoundaryLookup(databasePath) };
      void previous?.lookup.close();
    }
    const [label] = await current.lookup.lookup([{ lat: pin.latitude, lng: pin.longitude }]);
    return pin.expiresAtMs > Date.now() ? label || null : null;
  } catch { return null; }
}
