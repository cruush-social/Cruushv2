import { hasPreferenceAccount, readAccountPreference, saveAccountPreference, subscribeAccountPreferences } from './accountPreferences';
export const ACCESSIBILITY_PREFERENCES_CHANGED_EVENT = 'cruush:accessibility-preferences-changed';
export const ACCESSIBILITY_PREFERENCES_STORAGE_KEY = 'cruush:accessibility-preferences';

export const COLOR_VISION_MODES = [
  'off',
  'deuteranomaly',
  'deuteranopia',
  'protanomaly',
  'protanopia',
  'tritanomaly',
  'tritanopia',
  'monochromacy',
] as const;

export type ColorVisionMode = typeof COLOR_VISION_MODES[number];

export type AccessibilityPreferences = {
  /** Kept while stored preferences from the original toggle migrate. */
  colorBlindMode?: boolean;
  colorVisionMode: ColorVisionMode;
  hapticFeedback: boolean;
  highContrast: boolean;
  largerText: boolean;
  reduceMotion: boolean;
};

export type AccessibilityPreferencesListener = (preferences: AccessibilityPreferences) => void;

const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  colorBlindMode: false,
  colorVisionMode: 'off',
  hapticFeedback: true,
  highContrast: false,
  largerText: false,
  reduceMotion: false,
};

export function getAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_ACCESSIBILITY_PREFERENCES;
  }

  try {
    const stored = hasPreferenceAccount()
      ? readAccountPreference('display.accessibility', DEFAULT_ACCESSIBILITY_PREFERENCES)
      : JSON.parse(window.localStorage.getItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY) ?? '{}');
    const storedColorVisionMode = COLOR_VISION_MODES.includes(stored.colorVisionMode)
      ? stored.colorVisionMode as ColorVisionMode
      : stored.colorBlindMode === true
        ? 'deuteranopia'
        : 'off';

    return {
      colorBlindMode: storedColorVisionMode !== 'off',
      colorVisionMode: storedColorVisionMode,
      // On unless it was turned off, so the feedback is there without anyone
      // having to go looking for the switch.
      hapticFeedback: stored.hapticFeedback !== false,
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
  const colorVisionMode = preferences.colorVisionMode
    ?? (preferences.colorBlindMode === true ? 'deuteranopia' : 'off');
  root.toggleAttribute('data-cruush-color-blind', colorVisionMode !== 'off');
  if (colorVisionMode === 'off') {
    root.removeAttribute('data-cruush-color-vision');
  } else {
    root.setAttribute('data-cruush-color-vision', colorVisionMode);
  }
  root.toggleAttribute('data-cruush-high-contrast', preferences.highContrast);
  root.toggleAttribute('data-cruush-larger-text', preferences.largerText);
  root.toggleAttribute('data-cruush-reduce-motion', preferences.reduceMotion);
  root.toggleAttribute('data-cruush-haptics', preferences.hapticFeedback !== false);
}

export function saveAccessibilityPreferences(preferences: AccessibilityPreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const colorVisionMode = preferences.colorVisionMode
      ?? (preferences.colorBlindMode === true ? 'deuteranopia' : 'off');
    const saved = {
      ...preferences,
      colorBlindMode: colorVisionMode !== 'off',
      colorVisionMode,
    };
    if (hasPreferenceAccount()) void saveAccountPreference('display.accessibility', saved).catch(() => undefined);
    else window.localStorage.setItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY, JSON.stringify(saved));
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
  const unsubscribe = subscribeAccountPreferences(syncPreferences);

  return () => { unsubscribe(); window.removeEventListener(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT, syncPreferences); };
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

if (typeof window !== 'undefined') subscribeAccountPreferences(() => applyAccessibilityPreferences());
