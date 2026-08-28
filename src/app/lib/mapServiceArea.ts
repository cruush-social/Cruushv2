export const MAP_SERVICE_RADIUS_MILES = 100;

export const MAP_SERVICE_CENTER = {
  latitude: 40.6828509,
  longitude: -73.9521325,
} as const;

const LATITUDE_MILES_PER_DEGREE = 69;

function longitudeMilesPerDegree(latitude: number) {
  return LATITUDE_MILES_PER_DEGREE * Math.cos(latitude * Math.PI / 180);
}

const latitudeRadius = MAP_SERVICE_RADIUS_MILES / LATITUDE_MILES_PER_DEGREE;
const longitudeRadius = MAP_SERVICE_RADIUS_MILES / longitudeMilesPerDegree(MAP_SERVICE_CENTER.latitude);

export const MAP_SERVICE_MAX_BOUNDS = [
  [
    MAP_SERVICE_CENTER.longitude - longitudeRadius,
    MAP_SERVICE_CENTER.latitude - latitudeRadius,
  ],
  [
    MAP_SERVICE_CENTER.longitude + longitudeRadius,
    MAP_SERVICE_CENTER.latitude + latitudeRadius,
  ],
] as const;

const EARTH_RADIUS_MILES = 3958.7613;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const SERVICE_AREA_CIRCLE_STEPS = 720;

type Position = [number, number];

export type MapServiceOutsideMask = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: {
    type: 'Polygon';
    coordinates: Position[][];
  };
};

function destinationPoint(
  center: typeof MAP_SERVICE_CENTER,
  distanceMiles: number,
  bearingRadians: number,
): Position {
  const latitudeRadians = center.latitude * Math.PI / 180;
  const longitudeRadians = center.longitude * Math.PI / 180;
  const angularDistance = distanceMiles / EARTH_RADIUS_MILES;
  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance)
      + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const destinationLongitude = longitudeRadians + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
  );
  const longitude = ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180;

  return [longitude, destinationLatitude * 180 / Math.PI];
}

function createServiceAreaHole(): Position[] {
  const ring = Array.from({ length: SERVICE_AREA_CIRCLE_STEPS }, (_, index) => destinationPoint(
    MAP_SERVICE_CENTER,
    MAP_SERVICE_RADIUS_MILES,
    index / SERVICE_AREA_CIRCLE_STEPS * Math.PI * 2,
  ));

  ring.push([...ring[0]] as Position);
  return ring;
}

/**
 * A solid world polygon with the approved circular service area cut out as a
 * hole. Rendering it above map tiles hides everything outside the 20-mile
 * circle without tinting or decorating anything inside it.
 */
export const MAP_SERVICE_OUTSIDE_MASK: MapServiceOutsideMask = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-180, -WEB_MERCATOR_MAX_LATITUDE],
        [180, -WEB_MERCATOR_MAX_LATITUDE],
        [180, WEB_MERCATOR_MAX_LATITUDE],
        [-180, WEB_MERCATOR_MAX_LATITUDE],
        [-180, -WEB_MERCATOR_MAX_LATITUDE],
      ],
      createServiceAreaHole(),
    ],
  },
};
