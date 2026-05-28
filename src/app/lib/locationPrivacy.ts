export type ExactCoordinates = {
  latitude: number;
  longitude: number;
};

export type ApproximateCoordinates = {
  approximateLatitude: number;
  approximateLongitude: number;
  privacyRadiusMeters: number;
};

export type ApproximationOptions = {
  privacyRadiusMeters?: number;
};

export const DEFAULT_LOCATION_PRIVACY_RADIUS_METERS = 250;

const METERS_PER_LATITUDE_DEGREE = 111_320;

function clampCoordinate(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function snapToStep(value: number, step: number) {
  return Number((Math.round(value / step) * step).toFixed(6));
}

export function approximateDisplayCoordinates(
  coordinates: ExactCoordinates,
  options: ApproximationOptions = {},
): ApproximateCoordinates {
  const privacyRadiusMeters = Math.max(
    1,
    Math.round(options.privacyRadiusMeters ?? DEFAULT_LOCATION_PRIVACY_RADIUS_METERS),
  );
  const latitudeStep = privacyRadiusMeters / METERS_PER_LATITUDE_DEGREE;
  const latitudeRadians = coordinates.latitude * (Math.PI / 180);
  const longitudeScale = Math.max(0.01, Math.abs(Math.cos(latitudeRadians)));
  const longitudeStep = privacyRadiusMeters / (METERS_PER_LATITUDE_DEGREE * longitudeScale);

  return {
    approximateLatitude: clampCoordinate(snapToStep(coordinates.latitude, latitudeStep), -90, 90),
    approximateLongitude: clampCoordinate(snapToStep(coordinates.longitude, longitudeStep), -180, 180),
    privacyRadiusMeters,
  };
}
