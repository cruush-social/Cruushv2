const EARTH_RADIUS_MILES = 3958.7613;

export const NYC_SERVICE_AREA = {
  center: { lat: 40.7128, lng: -74.006 },
  radiusMiles: 100
} as const;

function toRadians(degrees: number) {
  return degrees * Math.PI / 180;
}

export function distanceMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinServiceArea(location: { lat: number; lng: number }) {
  return distanceMiles(location, NYC_SERVICE_AREA.center) <= NYC_SERVICE_AREA.radiusMiles;
}
