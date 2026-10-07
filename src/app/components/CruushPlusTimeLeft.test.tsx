import { describe, expect, it } from 'vitest';
import { formatCruushPlusTimeLeft } from './CruushPlusTimeLeft';

describe('formatCruushPlusTimeLeft', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');

  it('counts days, hours, minutes and seconds', () => {
    expect(formatCruushPlusTimeLeft('2026-10-19T16:33:21.000Z', now)).toBe('12d 04:33:21');
  });

  it('drops the day part inside the last day and never goes negative', () => {
    expect(formatCruushPlusTimeLeft('2026-10-07T12:05:09.000Z', now)).toBe('00:05:09');
    expect(formatCruushPlusTimeLeft('2026-10-01T00:00:00.000Z', now)).toBe('00:00:00');
  });
});
