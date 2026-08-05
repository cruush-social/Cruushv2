export const DEFAULT_MAP_PRESENCE_DAYS = 7;
export const MIN_MAP_PRESENCE_DAYS = 1;
export const MAX_MAP_PRESENCE_DAYS = 30;

export function normalizeMapPresenceDays(value: unknown) {
  const days = typeof value === "number" ? Math.round(value) : Number.NaN;

  if (!Number.isFinite(days)) {
    return DEFAULT_MAP_PRESENCE_DAYS;
  }

  return Math.min(MAX_MAP_PRESENCE_DAYS, Math.max(MIN_MAP_PRESENCE_DAYS, days));
}
