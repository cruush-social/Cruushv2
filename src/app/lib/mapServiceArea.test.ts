import { describe, expect, it } from 'vitest';
import {
  MAP_SERVICE_CENTER,
  MAP_SERVICE_MAX_BOUNDS,
  MAP_SERVICE_OUTSIDE_MASK,
  MAP_SERVICE_RADIUS_MILES,
  createMapOutsideRadiusMask,
} from './mapServiceArea';

const EARTH_RADIUS_MILES = 3958.7613;

function distanceMiles([longitude, latitude]: [number, number]) {
  const latitudeDelta = (latitude - MAP_SERVICE_CENTER.latitude) * Math.PI / 180;
  const longitudeDelta = (longitude - MAP_SERVICE_CENTER.longitude) * Math.PI / 180;
  const centerLatitude = MAP_SERVICE_CENTER.latitude * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(centerLatitude) * Math.cos(latitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(haversine));
}

function signedArea(ring: Array<[number, number]>) {
  return ring.slice(0, -1).reduce((area, [longitude, latitude], index) => {
    const [nextLongitude, nextLatitude] = ring[index + 1];
    return area + longitude * nextLatitude - nextLongitude * latitude;
  }, 0) / 2;
}

describe('mapServiceArea', () => {
  it('cuts a fifty-mile browse hole around the supplied Mile High Club origin', () => {
    const origin = { latitude: 40.5, longitude: -73.5 };
    const mask = createMapOutsideRadiusMask(origin, 50);
    const browseHole = mask.geometry.coordinates[1];

    expect(browseHole).toHaveLength(721);
    expect(browseHole[0]).toEqual(browseHole.at(-1));
    browseHole.slice(0, -1).forEach(([longitude, latitude]) => {
      const latitudeDelta = (latitude - origin.latitude) * Math.PI / 180;
      const longitudeDelta = (longitude - origin.longitude) * Math.PI / 180;
      const originLatitude = origin.latitude * Math.PI / 180;
      const latitudeRadians = latitude * Math.PI / 180;
      const haversine = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(originLatitude) * Math.cos(latitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;
      const miles = 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(haversine));

      expect(miles).toBeCloseTo(50, 8);
    });
  });

  it('defines a twenty-mile boundary around the configured service center', () => {
    const [[west, south], [east, north]] = MAP_SERVICE_MAX_BOUNDS;
    const northSouthMiles = (north - MAP_SERVICE_CENTER.latitude) * 69;
    const eastWestMiles = (east - MAP_SERVICE_CENTER.longitude)
      * 69
      * Math.cos(MAP_SERVICE_CENTER.latitude * Math.PI / 180);

    expect(MAP_SERVICE_RADIUS_MILES).toBe(100);
    expect(northSouthMiles).toBeCloseTo(100, 5);
    expect(eastWestMiles).toBeCloseTo(100, 5);
    expect(MAP_SERVICE_CENTER.latitude - south).toBeCloseTo(north - MAP_SERVICE_CENTER.latitude, 8);
    expect(MAP_SERVICE_CENTER.longitude - west).toBeCloseTo(east - MAP_SERVICE_CENTER.longitude, 8);
  });

  it('cuts an exact circular hole out of an otherwise solid world mask', () => {
    const [worldRing, serviceAreaHole] = MAP_SERVICE_OUTSIDE_MASK.geometry.coordinates;

    expect(MAP_SERVICE_OUTSIDE_MASK.geometry.type).toBe('Polygon');
    expect(worldRing[0]).toEqual(worldRing.at(-1));
    expect(serviceAreaHole[0]).toEqual(serviceAreaHole.at(-1));
    expect(serviceAreaHole).toHaveLength(721);
    expect(signedArea(worldRing)).toBeGreaterThan(0);
    expect(signedArea(serviceAreaHole)).toBeLessThan(0);

    serviceAreaHole.slice(0, -1).forEach((point) => {
      expect(distanceMiles(point)).toBeCloseTo(MAP_SERVICE_RADIUS_MILES, 8);
    });
  });

  it('masks the rectangular max-bound corners that fall outside the circle', () => {
    const [[west, south], [east, north]] = MAP_SERVICE_MAX_BOUNDS;
    const corners: Array<[number, number]> = [
      [west, south],
      [west, north],
      [east, south],
      [east, north],
    ];
    const serviceAreaHole = MAP_SERVICE_OUTSIDE_MASK.geometry.coordinates[1];

    corners.forEach((corner) => {
      expect(distanceMiles(corner)).toBeGreaterThan(MAP_SERVICE_RADIUS_MILES);
    });
    serviceAreaHole.slice(0, -1).forEach((point, index) => {
      const nextPoint = serviceAreaHole[index + 1];
      const midpoint: [number, number] = [
        (point[0] + nextPoint[0]) / 2,
        (point[1] + nextPoint[1]) / 2,
      ];

      expect(distanceMiles(midpoint)).toBeLessThanOrEqual(MAP_SERVICE_RADIUS_MILES);
    });
  });
});
