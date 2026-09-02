import { useEffect, useState } from 'react';

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

export function getDistancePreferences(): DistancePreferences {
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

export function saveDistancePreferences(preferences: DistancePreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(DISTANCE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage failure
  }

  window.dispatchEvent(new CustomEvent(DISTANCE_PREFERENCES_CHANGED_EVENT, { detail: preferences }));
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
 * a rough band when approximate.
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
  const match = /^~?\s*([\d.]+)\s*(mi|miles?)(.*)$/i.exec(trimmed);
  if (!match) {
    return distance;
  }

  const numericMiles = Number.parseFloat(match[1]);
  const suffix = match[3] ?? '';

  if (!Number.isFinite(numericMiles)) {
    return distance;
  }

  let approxText: string;
  if (numericMiles < 0.25) {
    approxText = '< 0.25 mi';
  } else if (numericMiles < 0.5) {
    approxText = '~0.5 mi';
  } else if (numericMiles < 1) {
    approxText = '~1 mi';
  } else {
    const rounded = Math.round(numericMiles);
    approxText = `~${rounded} mi`;
  }

  return `${approxText}${suffix}`;
}

export function formatDistanceWithAway(
  distance: string | null | undefined,
  mode: DistanceDisplayMode = getDistancePreferences().mode,
): string | null {
  const formatted = formatDistanceLabel(distance, mode);
  if (!formatted || /\baway$/i.test(formatted)) return formatted;
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
