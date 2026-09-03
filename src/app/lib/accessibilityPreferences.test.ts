import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESSIBILITY_PREFERENCES_CHANGED_EVENT,
  ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
  addAccessibilityPreferencesChangedListener,
  installAccessibilityPreferencesStorageSync,
  saveAccessibilityPreferences,
} from './accessibilityPreferences';

const ALL_PREFERENCES_ON = {
  colorVisionMode: 'deuteranopia' as const,
  highContrast: true,
  largerText: true,
  reduceMotion: true,
};

// Stored and broadcast preferences carry the migrated colorBlindMode flag
// alongside the colour-vision selection.
const ALL_PREFERENCES_ON_NORMALIZED = {
  ...ALL_PREFERENCES_ON,
  colorBlindMode: true,
};

function resetAccessibilityState() {
  window.localStorage.removeItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
  document.documentElement.removeAttribute('data-cruush-color-blind');
  document.documentElement.removeAttribute('data-cruush-color-vision');
  document.documentElement.removeAttribute('data-cruush-high-contrast');
  document.documentElement.removeAttribute('data-cruush-larger-text');
  document.documentElement.removeAttribute('data-cruush-reduce-motion');
}

describe('accessibility preferences', () => {
  beforeEach(resetAccessibilityState);
  afterEach(resetAccessibilityState);

  it('applies every saved preference from the document root', () => {
    saveAccessibilityPreferences(ALL_PREFERENCES_ON);

    expect(document.documentElement).toHaveAttribute('data-cruush-color-blind');
    expect(document.documentElement).toHaveAttribute('data-cruush-color-vision', 'deuteranopia');
    expect(document.documentElement).toHaveAttribute('data-cruush-high-contrast');
    expect(document.documentElement).toHaveAttribute('data-cruush-larger-text');
    expect(document.documentElement).toHaveAttribute('data-cruush-reduce-motion');
  });

  it('re-applies preferences and updates controls after another tab changes storage', () => {
    const listener = vi.fn();
    const removeListener = addAccessibilityPreferencesChangedListener(listener);
    const removeStorageSync = installAccessibilityPreferencesStorageSync();

    window.localStorage.setItem(
      ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
      JSON.stringify(ALL_PREFERENCES_ON),
    );
    window.dispatchEvent(new StorageEvent('storage', {
      key: ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
      newValue: JSON.stringify(ALL_PREFERENCES_ON),
    }));

    expect(listener).toHaveBeenCalledWith(ALL_PREFERENCES_ON_NORMALIZED);
    expect(document.documentElement).toHaveAttribute('data-cruush-color-blind');
    expect(document.documentElement).toHaveAttribute('data-cruush-color-vision', 'deuteranopia');
    expect(document.documentElement).toHaveAttribute('data-cruush-high-contrast');
    expect(document.documentElement).toHaveAttribute('data-cruush-larger-text');
    expect(document.documentElement).toHaveAttribute('data-cruush-reduce-motion');

    removeStorageSync();
    removeListener();
  });

  it('notifies listeners when controls change in the current page', () => {
    const listener = vi.fn();
    const removeListener = addAccessibilityPreferencesChangedListener(listener);

    saveAccessibilityPreferences(ALL_PREFERENCES_ON);

    expect(listener).toHaveBeenCalledWith(ALL_PREFERENCES_ON_NORMALIZED);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(new CustomEvent(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT).type)
      .toBe(ACCESSIBILITY_PREFERENCES_CHANGED_EVENT);

    removeListener();
  });
});
