import { useEffect, useState } from 'react';

export const DISTANCE_PREFERENCES_CHANGED_EVENT = 'cruush:distance-preferences-changed';
export const DISTANCE_PREFERENCES_STORAGE_KEY = 'cruush:distance-preference';

export type DistanceDisplayMode = 'exact' | 'approximate';

export type DistancePreferences = {
  mode: DistanceDisplayMode;
};

export type DistancePreferencesListener = (preferences: DistancePreferences) => void;

const DEFAULT_DISTANCE_PREFERENCES: DistancePreferences = {
  mode: 'exact',
};

export function getDistancePreferences(): DistancePreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_DISTANCE_PREFERENCES;
  }

  try {
    const stored = window.localStorage.getItem(DISTANCE_PREFERENCES_STORAGE_KEY);
    if (stored === 'approximate' || stored === 'exact') {
      return { mode: stored };
    }
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.mode === 'approximate' || parsed.mode === 'exact') {
        return { mode: parsed.mode as DistanceDisplayMode };
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
 * Formats a distance string respecting exact vs approximate display preference.
 */
export function formatDistanceLabel(
  distance: string | null | undefined,
  mode: DistanceDisplayMode = getDistancePreferences().mode,
): string | null {
  if (!distance) return null;
  if (distance === 'You' || distance === 'Own profile') return distance;

  if (mode === 'exact') {
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
