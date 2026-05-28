import { describe, expect, it } from 'vitest';
import { approximateDisplayCoordinates, DEFAULT_LOCATION_PRIVACY_RADIUS_METERS } from './locationPrivacy';

describe('approximateDisplayCoordinates', () => {
  it('snaps exact coordinates to an approximate display area', () => {
    const approximateCoordinates = approximateDisplayCoordinates({
      latitude: 40.7128123,
      longitude: -74.0060123,
    });

    expect(approximateCoordinates.privacyRadiusMeters).toBe(DEFAULT_LOCATION_PRIVACY_RADIUS_METERS);
    expect(approximateCoordinates.approximateLatitude).not.toBe(40.7128123);
    expect(approximateCoordinates.approximateLongitude).not.toBe(-74.0060123);
  });

  it('supports a larger privacy radius for future fuzzing rules', () => {
    const defaultApproximation = approximateDisplayCoordinates({
      latitude: 40.7128123,
      longitude: -74.0060123,
    });
    const largerApproximation = approximateDisplayCoordinates(
      {
        latitude: 40.7128123,
        longitude: -74.0060123,
      },
      { privacyRadiusMeters: 500 },
    );

    expect(largerApproximation.privacyRadiusMeters).toBe(500);
    expect(largerApproximation).not.toEqual(defaultApproximation);
  });
});
