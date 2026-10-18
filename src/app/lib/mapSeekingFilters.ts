import { readAccountPreference, saveAccountPreference, getPreferenceAccountId, hasSavedAccountPreference } from './accountPreferences';
import type { FilterState } from '../components/MapFiltersSurface';


/** Account preferences are restored before signed-in routes mount. */
export function readMapSeekingFilters(ownerId: string | undefined, defaults: FilterState): FilterState | null {
  if (!ownerId || ownerId !== getPreferenceAccountId() || !hasSavedAccountPreference('map.seeking')) return null;
  try {
    const saved = { ownerId, filters: readAccountPreference('map.seeking', defaults) };
    if (saved?.ownerId !== ownerId || !saved.filters || typeof saved.filters !== 'object') return null;
    const value = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof FilterState>) {
      const candidate = saved.filters[key];
      const fallback = defaults[key];
      if (key === 'ageRange') {
        if (!Array.isArray(candidate) || candidate.length !== 2 || !candidate.every(Number.isFinite)
          || candidate[0] < 18 || candidate[1] > 99 || candidate[0] > candidate[1]) return null;
      } else if (key === 'distance') {
        if (!Number.isInteger(candidate) || candidate < 1 || candidate > 100) return null;
      } else if (Array.isArray(fallback)) {
        if (!Array.isArray(candidate) || !candidate.every(item => typeof item === 'string')) return null;
      } else if (typeof candidate !== typeof fallback || (typeof candidate === 'number' && (!Number.isFinite(candidate) || candidate < 0))) {
        return null;
      }
      Object.assign(value, { [key]: candidate });
    }
    return value;
  } catch { return null; }
}

export function saveMapSeekingFilters(ownerId: string | undefined, filters: FilterState) {
  if (!ownerId || ownerId !== getPreferenceAccountId()) return;
  void saveAccountPreference('map.seeking', filters).catch(() => undefined);
}
