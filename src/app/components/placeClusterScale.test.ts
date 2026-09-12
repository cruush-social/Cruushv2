import { describe, expect, it } from 'vitest';
import { applyPlaceMarkerClusters } from './MapView';

/**
 * Clustering used to compare every Spot against every other Spot. That is fine
 * for a handful and quadratic for the thousands a wide viewport can hold, which
 * is what made the map crawl. The work is bucketed by grid cell now.
 */
function spread(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `place-${index}`,
    kind: 'place' as const,
    approximateLatitude: 40.7 + (index % 90) * 0.01,
    approximateLongitude: -74 + Math.floor(index / 90) * 0.01,
  })) as never[];
}

describe('place clustering scale', () => {
  it('clusters a large viewport without quadratic work', () => {
    const many = spread(4000);

    const started = performance.now();
    const result = applyPlaceMarkerClusters(many, 10);
    const elapsed = performance.now() - started;

    expect(result.length).toBeGreaterThan(0);
    // The pairwise version ran eight million comparisons for this input. The
    // ceiling is deliberately loose: it fails on a return to quadratic work,
    // not on ordinary machine-to-machine variation.
    expect(elapsed).toBeLessThan(2000);
  });

  it('still merges Spots that sit within the separation distance', () => {
    const tight = Array.from({ length: 6 }, (_, index) => ({
      id: `tight-${index}`,
      kind: 'place' as const,
      approximateLatitude: 40.7 + index * 0.000002,
      approximateLongitude: -74 + index * 0.000002,
    })) as never[];

    const result = applyPlaceMarkerClusters(tight, 10);

    expect(result.length).toBeLessThan(tight.length);
  });
});
