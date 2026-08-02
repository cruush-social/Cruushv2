import type { MapMarker } from './mapMarkers';

export type DenseVenueConfig = {
  id: string;
  center: {
    approximateLatitude: number;
    approximateLongitude: number;
  };
  radiusMeters: number;
  clusterZoom: number;
  clusterThreshold: number;
  maxIndividualMarkers: number;
};

function metersBetween(
  first: { approximateLatitude: number; approximateLongitude: number },
  second: { approximateLatitude: number; approximateLongitude: number },
) {
  const latMeters = (first.approximateLatitude - second.approximateLatitude) * 111_320;
  const lngScale = Math.max(0.01, Math.cos(second.approximateLatitude * Math.PI / 180));
  const lngMeters = (first.approximateLongitude - second.approximateLongitude) * 111_320 * lngScale;

  return Math.sqrt(latMeters ** 2 + lngMeters ** 2);
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }

  return hash >>> 0;
}

function staggerMarker(marker: MapMarker, index: number, center: DenseVenueConfig['center']) {
  const hash = hashString(marker.id);
  const ring = Math.floor(index / 10) + 1;
  const angle = ((hash % 360) * Math.PI) / 180;
  const radiusMeters = 12 + ring * 10 + (hash % 7);
  const northMeters = Math.cos(angle) * radiusMeters;
  const eastMeters = Math.sin(angle) * radiusMeters;
  const lngScale = Math.max(0.01, Math.cos(center.approximateLatitude * Math.PI / 180));

  return {
    ...marker,
    approximateLatitude: center.approximateLatitude + northMeters / 111_320,
    approximateLongitude: center.approximateLongitude + eastMeters / (111_320 * lngScale),
  };
}

export function applyDenseVenueMarkers(markers: MapMarker[], venue: DenseVenueConfig | null | undefined, zoom: number) {
  if (!venue) {
    return {
      markers,
      clusteredCount: 0,
      overflowCount: 0,
    };
  }

  const venuePeople = markers.filter((marker) => (
    (marker.kind ?? 'person') === 'person' &&
    marker.isCurrentUser !== true &&
    metersBetween(marker, venue.center) <= venue.radiusMeters
  ));

  if (venuePeople.length < venue.clusterThreshold) {
    return {
      markers,
      clusteredCount: 0,
      overflowCount: 0,
    };
  }

  const venueIds = new Set(venuePeople.map((marker) => marker.id));
  const outsideVenue = markers.filter((marker) => !venueIds.has(marker.id));

  if (zoom < venue.clusterZoom) {
    return {
      markers: [
        ...outsideVenue,
        {
          id: `venue-cluster-${venue.id}`,
          kind: 'cluster',
          displayName: `${venuePeople.length} people at The Chocolate Factory`,
          approximateLatitude: venue.center.approximateLatitude,
          approximateLongitude: venue.center.approximateLongitude,
          cluster: {
            id: venue.id,
            count: venuePeople.length,
            label: `${venuePeople.length} people at The Chocolate Factory`,
            kind: 'venue',
          },
        } satisfies MapMarker,
      ],
      clusteredCount: venuePeople.length,
      overflowCount: 0,
    };
  }

  const visibleVenuePeople = venuePeople
    .slice(0, venue.maxIndividualMarkers)
    .map((marker, index) => staggerMarker(marker, index, venue.center));

  return {
    markers: [...outsideVenue, ...visibleVenuePeople],
    clusteredCount: 0,
    overflowCount: Math.max(0, venuePeople.length - visibleVenuePeople.length),
  };
}
