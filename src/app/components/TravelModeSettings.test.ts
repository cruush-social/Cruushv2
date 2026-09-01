import { describe, expect, it } from 'vitest';
import { formatTravelPinCountdown } from './TravelModeSettings';

describe('formatTravelPinCountdown', () => {
  it('carries a rounded sixtieth minute into the next hour', () => {
    const now = 1_000;

    expect(formatTravelPinCountdown(now + 3 * 60 * 60 * 1_000, now)).toBe('3h');
    expect(formatTravelPinCountdown(now + (2 * 60 * 60 + 59 * 60 + 1) * 1_000, now)).toBe('3h');
  });

  it('keeps ordinary hour and minute countdowns readable', () => {
    const now = 1_000;

    expect(formatTravelPinCountdown(now + (2 * 60 + 59) * 60 * 1_000, now)).toBe('2h 59m');
    expect(formatTravelPinCountdown(now + 59_001, now)).toBe('1m');
    expect(formatTravelPinCountdown(now, now)).toBe('0m');
  });
});
