export const MAP_SERVICE_RADIUS_MILES = 100;
const METERS_PER_MILE = 1609.344;
const WEB_MERCATOR_METERS_PER_PIXEL_AT_ZOOM_ZERO = 156543.03392804097;

export const MAP_SERVICE_CENTER = {
  latitude: 40.7128,
  longitude: -74.006,
} as const;

const LATITUDE_MILES_PER_DEGREE = 69;

function longitudeMilesPerDegree(latitude: number) {
  return LATITUDE_MILES_PER_DEGREE * Math.cos(latitude * Math.PI / 180);
}

/** Lowest zoom that keeps the complete service circle inside the viewport. */
export function mapServiceMinZoomForViewport(width: number, height: number, fallbackZoom = 9.2) {
  const availablePixels = Math.min(width, height);
  if (!Number.isFinite(availablePixels) || availablePixels <= 0) {
    return fallbackZoom;
  }

  const metersPerPixelAtCenter = WEB_MERCATOR_METERS_PER_PIXEL_AT_ZOOM_ZERO
    * Math.cos(MAP_SERVICE_CENTER.latitude * Math.PI / 180);
  const serviceDiameterMeters = MAP_SERVICE_RADIUS_MILES * METERS_PER_MILE * 2;

  return Math.max(0, Math.log2(metersPerPixelAtCenter * availablePixels / serviceDiameterMeters));
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

type MapRadiusCenter = {
  latitude: number;
  longitude: number;
};

function destinationPoint(
  center: MapRadiusCenter,
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

function createOutsideRadiusHole(center: MapRadiusCenter, radiusMiles: number): Position[] {
  const ring = Array.from({ length: SERVICE_AREA_CIRCLE_STEPS }, (_, index) => destinationPoint(
    center,
    radiusMiles,
    index / SERVICE_AREA_CIRCLE_STEPS * Math.PI * 2,
  ));

  ring.push([...ring[0]] as Position);
  return ring;
}

/**
 * A world polygon with the approved circular service area cut out as a hole.
 * Rendering it above map tiles creates fog of war outside the 100-mile circle
 * without tinting or decorating anything inside it.
 */
export function createMapOutsideRadiusMask(
  center: MapRadiusCenter,
  radiusMiles: number,
): MapServiceOutsideMask {
  return {
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
        createOutsideRadiusHole(center, radiusMiles),
      ],
    },
  };
}

export const MAP_SERVICE_OUTSIDE_MASK = createMapOutsideRadiusMask(
  MAP_SERVICE_CENTER,
  MAP_SERVICE_RADIUS_MILES,
);
