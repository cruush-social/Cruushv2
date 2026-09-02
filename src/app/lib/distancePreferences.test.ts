import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISTANCE_PREFERENCES_STORAGE_KEY,
  formatDistanceLabel,
  getDistancePreferences,
  saveDistancePreferences,
} from './distancePreferences';

describe('distancePreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to approximate mode when no preference is stored', () => {
    expect(getDistancePreferences()).toEqual({ mode: 'approximate' });
  });

  it('reads and saves precise and approximate preferences', () => {
    saveDistancePreferences({ mode: 'approximate' });
    expect(getDistancePreferences()).toEqual({ mode: 'approximate' });

    saveDistancePreferences({ mode: 'precise' });
    expect(getDistancePreferences()).toEqual({ mode: 'precise' });
  });

  it('formats precise distance labels unchanged', () => {
    expect(formatDistanceLabel('0.4 mi', 'precise')).toBe('0.4 mi');
    expect(formatDistanceLabel('1.2 mi away', 'precise')).toBe('1.2 mi away');
    expect(formatDistanceLabel('You', 'precise')).toBe('You');
  });

  it('migrates the removed no-label preference to approximate', () => {
    window.localStorage.setItem(DISTANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({ mode: 'off' }));
    expect(getDistancePreferences()).toEqual({ mode: 'approximate' });
  });

  it('formats approximate distance labels into rounded representations', () => {
    expect(formatDistanceLabel('0.1 mi', 'approximate')).toBe('< 0.25 mi');
    expect(formatDistanceLabel('0.4 mi away', 'approximate')).toBe('~0.5 mi away');
    expect(formatDistanceLabel('0.8 mi', 'approximate')).toBe('~1 mi');
    expect(formatDistanceLabel('3.4 mi away', 'approximate')).toBe('~3 mi away');
    expect(formatDistanceLabel('You', 'approximate')).toBe('You');
  });
});
