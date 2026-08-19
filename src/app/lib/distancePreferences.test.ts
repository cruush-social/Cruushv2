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

  it('defaults to exact mode when no preference is stored', () => {
    expect(getDistancePreferences()).toEqual({ mode: 'exact' });
  });

  it('reads and saves exact and approximate preferences', () => {
    saveDistancePreferences({ mode: 'approximate' });
    expect(getDistancePreferences()).toEqual({ mode: 'approximate' });

    saveDistancePreferences({ mode: 'exact' });
    expect(getDistancePreferences()).toEqual({ mode: 'exact' });
  });

  it('formats exact distance labels unchanged', () => {
    expect(formatDistanceLabel('0.4 mi', 'exact')).toBe('0.4 mi');
    expect(formatDistanceLabel('1.2 mi away', 'exact')).toBe('1.2 mi away');
    expect(formatDistanceLabel('You', 'exact')).toBe('You');
  });

  it('formats approximate distance labels into rounded representations', () => {
    expect(formatDistanceLabel('0.1 mi', 'approximate')).toBe('< 0.25 mi');
    expect(formatDistanceLabel('0.4 mi away', 'approximate')).toBe('~0.5 mi away');
    expect(formatDistanceLabel('0.8 mi', 'approximate')).toBe('~1 mi');
    expect(formatDistanceLabel('3.4 mi away', 'approximate')).toBe('~3 mi away');
    expect(formatDistanceLabel('You', 'approximate')).toBe('You');
  });
});
