export const ACCESSIBILITY_PREFERENCES_CHANGED_EVENT = 'cruush:accessibility-preferences-changed';
export const ACCESSIBILITY_PREFERENCES_STORAGE_KEY = 'cruush:accessibility-preferences';

export type AccessibilityPreferences = {
  colorBlindMode?: boolean;
  highContrast: boolean;
  largerText: boolean;
  reduceMotion: boolean;
};

export type AccessibilityPreferencesListener = (preferences: AccessibilityPreferences) => void;

const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  colorBlindMode: false,
  highContrast: false,
  largerText: false,
  reduceMotion: false,
};

export function getAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_ACCESSIBILITY_PREFERENCES;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY) ?? '{}');

    return {
      colorBlindMode: stored.colorBlindMode === true,
      highContrast: stored.highContrast === true,
      largerText: stored.largerText === true,
      reduceMotion: stored.reduceMotion === true,
    };
  } catch {
    return DEFAULT_ACCESSIBILITY_PREFERENCES;
  }
}

export function applyAccessibilityPreferences(preferences = getAccessibilityPreferences()) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.toggleAttribute('data-cruush-color-blind', preferences.colorBlindMode === true);
  root.toggleAttribute('data-cruush-high-contrast', preferences.highContrast);
  root.toggleAttribute('data-cruush-larger-text', preferences.largerText);
  root.toggleAttribute('data-cruush-reduce-motion', preferences.reduceMotion);
}

export function saveAccessibilityPreferences(preferences: AccessibilityPreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Apply the preference for this page even when storage is unavailable.
  }

  applyAccessibilityPreferences(preferences);
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, { detail: preferences }));
}

export function addAccessibilityPreferencesChangedListener(
  listener: AccessibilityPreferencesListener,
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const syncPreferences = () => {
    const preferences = getAccessibilityPreferences();
    applyAccessibilityPreferences(preferences);
    listener(preferences);
  };

  window.addEventListener(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, syncPreferences);

  return () => window.removeEventListener(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, syncPreferences);
}

type AccessibilitySyncWindow = Window & {
  __cruushAccessibilityStorageSync?: (event: StorageEvent) => void;
};

export function installAccessibilityPreferencesStorageSync() {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const accessibilityWindow = window as AccessibilitySyncWindow;
  if (accessibilityWindow.__cruushAccessibilityStorageSync) {
    return () => {};
  }

  const syncStoredPreferences = (event: StorageEvent) => {
    if (event.key !== null && event.key !== ACCESSIBILITY_PREFERENCES_STORAGE_KEY) {
      return;
    }

    const preferences = getAccessibilityPreferences();
    applyAccessibilityPreferences(preferences);
    window.dispatchEvent(new CustomEvent(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, { detail: preferences }));
  };

  accessibilityWindow.__cruushAccessibilityStorageSync = syncStoredPreferences;
  window.addEventListener('storage', syncStoredPreferences);

  return () => {
    if (accessibilityWindow.__cruushAccessibilityStorageSync !== syncStoredPreferences) {
      return;
    }

    window.removeEventListener('storage', syncStoredPreferences);
    delete accessibilityWindow.__cruushAccessibilityStorageSync;
  };
}

export function shouldReduceMotion() {
  const appPreference = getAccessibilityPreferences().reduceMotion;
  const devicePreference = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return appPreference || devicePreference;
}
