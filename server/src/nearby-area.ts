import { createHmac } from "node:crypto";

const MILE_METERS = 1609.344;
const EARTH_RADIUS_METERS = 6371008.8;

/** Only accepts coordinates already authorized for display to this viewer. */
export function anonymousNearbyArea(
  secret: string,
  notificationId: string,
  displayed: { lat: number; lng: number }
) {
  // Keep repeat opens stable without publishing an invertible offset seed.
  // Both direction and distance vary, so the center does not identify a pin.
  const displayKey = `${Math.round(displayed.lat * 1e7)}:${Math.round(displayed.lng * 1e7)}`;
  const digest = createHmac("sha256", secret)
    .update(`nearby-area:${notificationId}:${displayKey}`)
    .digest();
  const bearing = digest.readUInt32BE(0) / 0x100000000 * 2 * Math.PI;
  const distance = MILE_METERS * (0.25 + 0.5 * digest.readUInt32BE(4) / 0x100000000);
  const angularDistance = distance / EARTH_RADIUS_METERS;
  const latitude = displayed.lat * Math.PI / 180;
  const longitude = displayed.lng * Math.PI / 180;
  const centerLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) +
    Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
  const centerLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(centerLatitude)
  );
  return {
    approximateLatitude: centerLatitude * 180 / Math.PI,
    approximateLongitude: ((centerLongitude * 180 / Math.PI + 540) % 360) - 180,
    radiusMiles: 1
  };
}
