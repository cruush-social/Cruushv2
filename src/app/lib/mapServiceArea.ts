export const MAP_SERVICE_RADIUS_MILES = 100;
const METERS_PER_MILE = 1609.344;
const WEB_MERCATOR_METERS_PER_PIXEL_AT_ZOOM_ZERO = 156543.03392804097;

export const MAP_SERVICE_CENTER = {
  latitude: 40.7128,
  longitude: -74.006,
} as const;

export const MAP_SERVICE_AREAS = [
  { center: MAP_SERVICE_CENTER, radiusMiles: MAP_SERVICE_RADIUS_MILES },
] as const;

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

const serviceAreaBounds = MAP_SERVICE_AREAS.reduce((bounds, area) => {
  const latitudeRadius = area.radiusMiles / LATITUDE_MILES_PER_DEGREE;
  const longitudeRadius = area.radiusMiles / longitudeMilesPerDegree(area.center.latitude);
  return {
    west: Math.min(bounds.west, area.center.longitude - longitudeRadius),
    south: Math.min(bounds.south, area.center.latitude - latitudeRadius),
    east: Math.max(bounds.east, area.center.longitude + longitudeRadius),
    north: Math.max(bounds.north, area.center.latitude + latitudeRadius),
  };
}, {
  west: Number.POSITIVE_INFINITY,
  south: Number.POSITIVE_INFINITY,
  east: Number.NEGATIVE_INFINITY,
  north: Number.NEGATIVE_INFINITY,
});

export const MAP_SERVICE_MAX_BOUNDS = [
  [
    serviceAreaBounds.west,
    serviceAreaBounds.south,
  ],
  [
    serviceAreaBounds.east,
    serviceAreaBounds.north,
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
 * Rendering it above map tiles creates fog of war outside the service areas
 * without tinting or decorating anything inside them.
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

export const MAP_SERVICE_OUTSIDE_MASK = {
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
      ...MAP_SERVICE_AREAS.map(({ center, radiusMiles }) => createOutsideRadiusHole(center, radiusMiles)),
    ],
  },
} satisfies MapServiceOutsideMask;

export function distanceMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const fromLatitude = from.latitude * Math.PI / 180;
  const toLatitude = to.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function isWithinMapServiceArea(point: { latitude: number; longitude: number }) {
  return MAP_SERVICE_AREAS.some(({ center, radiusMiles }) => (
    distanceMiles(point, center) <= radiusMiles
  ));
}
