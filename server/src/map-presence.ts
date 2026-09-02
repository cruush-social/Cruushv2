export const DEFAULT_MAP_PRESENCE_HOURS = 168;
export const MIN_MAP_PRESENCE_HOURS = 1;
export const MAX_MAP_PRESENCE_HOURS = 168;

export function normalizeMapPresenceHours(value: unknown) {
  const hours = typeof value === "number" ? Math.round(value) : Number.NaN;

  if (!Number.isFinite(hours)) {
    return DEFAULT_MAP_PRESENCE_HOURS;
  }

  return Math.min(MAX_MAP_PRESENCE_HOURS, Math.max(MIN_MAP_PRESENCE_HOURS, hours));
}
