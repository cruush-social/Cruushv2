import { useEffect, useState } from 'react';
import { requestApi } from './apiClient';

export const DISTANCE_PREFERENCES_CHANGED_EVENT = 'cruush:distance-preferences-changed';
export const DISTANCE_PREFERENCES_STORAGE_KEY = 'cruush:distance-preference';

/**
 * How far away someone is. Approximate and precise settings always read both
 * ways, with the stricter of the two people's settings winning. Dark Room owns
 * the separate option to replace distance text completely.
 */
export type DistanceDisplayMode = 'approximate' | 'precise';

export type DistancePreferences = {
  mode: DistanceDisplayMode;
};

export type DistancePreferencesListener = (preferences: DistancePreferences) => void;

const DISTANCE_DISPLAY_MODES: DistanceDisplayMode[] = ['approximate', 'precise'];

function isDistanceDisplayMode(value: unknown): value is DistanceDisplayMode {
  return typeof value === 'string' && (DISTANCE_DISPLAY_MODES as string[]).includes(value);
}

const DEFAULT_DISTANCE_PREFERENCES: DistancePreferences = {
  mode: 'approximate',
};

let transientPreferences: DistancePreferences | null = null;

export function getDistancePreferences(): DistancePreferences {
  if (transientPreferences) return transientPreferences;
  return readStoredDistancePreferences();
}

function readStoredDistancePreferences(): DistancePreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_DISTANCE_PREFERENCES;
  }

  try {
    const stored = window.localStorage.getItem(DISTANCE_PREFERENCES_STORAGE_KEY);
    if (isDistanceDisplayMode(stored)) {
      return { mode: stored };
    }
    if (stored) {
      const parsed = JSON.parse(stored);
      // 'exact' was the old name for precise labels.
      const mode = parsed.mode === 'exact'
        ? 'precise'
        : parsed.mode === 'off'
          ? 'approximate'
          : parsed.mode;
      if (isDistanceDisplayMode(mode)) {
        return { mode };
      }
    }
    return DEFAULT_DISTANCE_PREFERENCES;
  } catch {
    return DEFAULT_DISTANCE_PREFERENCES;
  }
}

function cacheDistancePreferences(preferences: DistancePreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  transientPreferences = null;

  try {
    window.localStorage.setItem(DISTANCE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage failure
  }

  window.dispatchEvent(new CustomEvent(DISTANCE_PREFERENCES_CHANGED_EVENT, { detail: preferences }));
}

function displayApproximateWhileSyncing() {
  transientPreferences = { mode: 'approximate' };
  window.dispatchEvent(new CustomEvent(DISTANCE_PREFERENCES_CHANGED_EVENT, { detail: transientPreferences }));
}

let preferenceUserId: string | null = null;
let preferenceRevision = 0;
let pendingSave: Promise<unknown> = Promise.resolve();

export async function saveDistancePreferences(preferences: DistancePreferences) {
  const revision = ++preferenceRevision;
  const userId = preferenceUserId;
  // Approximate applies immediately; numeric labels wait for server acceptance.
  if (preferences.mode === 'approximate') cacheDistancePreferences(preferences);
  try {
    const request = pendingSave.catch(() => undefined).then(() => {
      if (userId !== preferenceUserId) throw new Error('Account changed before saving.');
      return requestApi<DistancePreferences>('/api/privacy/distance-labels', {
        method: 'PUT', body: JSON.stringify(preferences),
      });
    });
    pendingSave = request;
    const saved = await request;
    if (revision === preferenceRevision && userId === preferenceUserId) cacheDistancePreferences(saved);
  } catch (error) {
    if (revision === preferenceRevision && userId === preferenceUserId) displayApproximateWhileSyncing();
    throw error;
  }
}

export function useSyncDistancePreferences(userId: string | null | undefined) {
  useEffect(() => {
    if (preferenceUserId !== (userId ?? null)) preferenceRevision += 1;
    if (!userId) {
      preferenceUserId = null;
      return;
    }
    preferenceUserId = userId;
    const revision = preferenceRevision;
    let active = true;
    const ownerKey = `${DISTANCE_PREFERENCES_STORAGE_KEY}:owner`;
    let legacy = readStoredDistancePreferences();
    let hasLegacyPreference = false;
    try {
      const previousOwner = window.localStorage.getItem(ownerKey);
      if (previousOwner && previousOwner !== userId) legacy = { mode: 'approximate' };
      hasLegacyPreference = window.localStorage.getItem(DISTANCE_PREFERENCES_STORAGE_KEY) !== null;
    } catch { /* Unavailable storage leaves the server's default in control. */ }
    displayApproximateWhileSyncing();
    void (async () => {
      try {
        let saved = await requestApi<DistancePreferences & { configured: boolean }>('/api/privacy/distance-labels');
        if (!active || preferenceUserId !== userId || revision !== preferenceRevision) return;
        if (!saved.configured && hasLegacyPreference) {
          const migration = pendingSave.catch(() => undefined).then(() => {
            if (!active || preferenceUserId !== userId || revision !== preferenceRevision) return null;
            return requestApi<DistancePreferences>('/api/privacy/distance-labels', {
              method: 'PUT', body: JSON.stringify(legacy),
            });
          });
          pendingSave = migration;
          const migrated = await migration;
          if (!migrated) return;
          saved = { ...migrated, configured: true };
        }
        if (!active || preferenceUserId !== userId || revision !== preferenceRevision) return;
        try { window.localStorage.setItem(ownerKey, userId); } catch { /* Optional local cache. */ }
        cacheDistancePreferences(saved);
      } catch {
        // Missing policy must never restore numeric labels on a guess.
        if (active && revision === preferenceRevision) displayApproximateWhileSyncing();
      }
    })();
    return () => { active = false; };
  }, [userId]);
}

export function addDistancePreferencesChangedListener(listener: DistancePreferencesListener) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const sync = () => {
    listener(getDistancePreferences());
  };

  window.addEventListener(DISTANCE_PREFERENCES_CHANGED_EVENT, sync);
  window.addEventListener('storage', sync);

  return () => {
    window.removeEventListener(DISTANCE_PREFERENCES_CHANGED_EVENT, sync);
    window.removeEventListener('storage', sync);
  };
}

export function useDistancePreferences() {
  const [preferences, setPreferences] = useState(getDistancePreferences);

  useEffect(() => addDistancePreferencesChangedListener(setPreferences), []);

  return preferences;
}

/**
 * Formats a distance string for the shared display mode: miles when precise,
 * the existing Nearby label when approximate.
 */
export function formatDistanceLabel(
  distance: string | null | undefined,
  mode: DistanceDisplayMode = getDistancePreferences().mode,
): string | null {
  if (!distance) return null;
  if (distance === 'You' || distance === 'Own profile') return distance;

  if (mode === 'precise') {
    return distance;
  }

  const trimmed = distance.trim();
  const match = /^(?:~|<|>)?\s*[\d.]+(?:\s*[-–]\s*[\d.]+)?\s*(?:mi|miles?|km|kilometers?|ft|feet)\b/i.exec(trimmed);
  if (!match) {
    return distance;
  }

  return 'Nearby';
}

export function formatDistanceWithAway(
  distance: string | null | undefined,
  mode: DistanceDisplayMode = getDistancePreferences().mode,
): string | null {
  const formatted = formatDistanceLabel(distance, mode);
  if (!formatted || formatted === 'Nearby' || /\baway$/i.test(formatted)) return formatted;
  return `${formatted} away`;
}

/**
 * What a viewer sees when the other person only shares a precise distance with
 * their mutuals or their crowds. The gate is named rather than hidden so the
 * label never looks like a distance it is not.
 */
export function resolveDistanceGateLabel(input: {
  preciseToMutualCruushes?: boolean | null;
  preciseToMutualCrowds?: boolean | null;
}) {
  if (input.preciseToMutualCrowds && input.preciseToMutualCruushes) {
    return 'crowds & cruushes only';
  }

  if (input.preciseToMutualCrowds) {
    return 'crowds only';
  }

  if (input.preciseToMutualCruushes) {
    return 'cruushes only';
  }

  return null;
}

/**
 * The label two people share. Both sides get the same answer, and the stricter
 * of the two settings decides it.
 */
export function resolveSharedDistanceMode(
  viewer: DistanceDisplayMode,
  subject: DistanceDisplayMode,
): DistanceDisplayMode {
  if (viewer === 'approximate' || subject === 'approximate') {
    return 'approximate';
  }

  return 'precise';
}
