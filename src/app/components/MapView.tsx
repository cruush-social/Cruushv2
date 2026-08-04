import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type {
  GeoJSONSource,
  LngLatLike,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  PointLike,
  StyleSpecification,
} from 'maplibre-gl';
import {
  ArrowDown,
  ArrowUp,
  Bed,
  CircleDot,
  MinusCircle,
  Mountain,
  MoveHorizontal,
  Repeat2,
  User,
  type LucideIcon,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CruushIcon } from './CruushIconImage';
import { resolveMediaUrl } from '../lib/apiClient';
import { applyDenseVenueMarkers, type DenseVenueConfig } from '../lib/denseVenueMarkers';
import {
  createMapMarkerBadge,
  type MapMarker,
  type MapMarkerBadge,
} from '../lib/mapMarkers';
import { HEART_PIN_PATH, HEART_PIN_PHOTO_PATH, HEART_PIN_THEMES } from '../lib/heartPin';
import { getProfileGradientStops } from '../lib/profileGradient';
import { addDlModeChangedListener, isDlModeEnabled } from '../lib/dlMode';

export { createMapMarkerBadge };

type RadiusCircle = {
  center: {
    approximateLatitude: number;
    approximateLongitude: number;
  };
  radiusMeters: number;
};

interface MapViewProps {
  onPinClick: (marker: MapMarker) => void;
  onMapClick?: () => void;
  onMapReady?: (map: MapLibreMap) => void;
  markers: MapMarker[];
  mobileSignalPreview?: boolean;
  enable3dBuildings?: boolean;
  heatmapEnabled?: boolean;
  onHeatmapAvailabilityChange?: (available: boolean) => void;
  fitToMarkers?: boolean;
  focusCoordinates?: {
    approximateLatitude: number;
    approximateLongitude: number;
  } | null;
  radiusCircle?: RadiusCircle | null;
  demoRadiusCircles?: RadiusCircle[];
  denseVenue?: DenseVenueConfig | null;
}

const DEFAULT_CENTER: LngLatLike = [-74.006, 40.7128];
const DEFAULT_ZOOM = 12;
const DEFAULT_3D_BUILDINGS_ZOOM = 14.4;
const FOCUSED_ZOOM = 14;
const FOCUSED_3D_BUILDINGS_ZOOM = 15.25;
const MIN_DISCOVERY_ZOOM = 10.5;
const NYC_METRO_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-74.65, 40.35],
  [-73.45, 41.08],
];
const DEFAULT_TILE_URLS = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];
const DEFAULT_ATTRIBUTION = '&copy; CARTO &copy; OpenStreetMap contributors';
const DEFAULT_VECTOR_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const MAP_ERROR_MESSAGE = 'Map tiles could not load. Check the map style or tile URL configuration.';
const MAP_READY_FALLBACK_TIMEOUT_MS = 4500;
const MAP_RENDER_READY_TIMEOUT_MS = 1200;
const MAP_LABEL_FONT_FAMILY = 'Cormorant Garamond';
const MAP_LABEL_FONT_REGULAR = ['Cormorant Garamond'];
const MAP_LABEL_FONT_BOLD = ['Cormorant Garamond Bold', 'Cormorant Garamond'];
const MAP_3D_BUILDINGS_PITCH = 45;
const MAP_3D_BUILDINGS_BEARING = -17.6;
const MAP_3D_BUILDING_LAYER_ID = 'building-extrusions-dark';
const MARKER_INTERACTION_SUPPRESS_MS = 350;
const PERSON_CLUSTER_MAX_ZOOM = 15.25;
const PERSON_CLUSTER_RADIUS_PX = 84;
const PERSON_CLUSTER_ZOOM_STEP = 1.5;
const SAME_LOCATION_CLUSTER_PRECISION = 6;
const SPIDERFY_RADIUS_PX = 86;
const SPIDERFY_SECOND_RING_RADIUS_PX = 122;
const SPIDERFY_SECOND_RING_AFTER = 10;
const MOBILE_SIGNAL_PREVIEW_ZOOM = 15.6;
const USER_HEATMAP_SOURCE_ID = 'cruush-user-heatmap';
const USER_HEATMAP_LAYER_ID = 'cruush-user-heatmap-layer';
const MAP_DETAIL_LAYER_TYPES = new Set(['line', 'symbol']);
const MAP_3D_BUILDING_HEIGHT_EXPRESSION = [
  'to-number',
  ['coalesce', ['get', 'render_height'], ['get', 'height']],
  34,
] as const;
const MAP_3D_BUILDING_BASE_EXPRESSION = [
  'to-number',
  ['coalesce', ['get', 'render_min_height'], ['get', 'min_height']],
  0,
] as const;

function create3dBuildingLayer(): StyleSpecification['layers'][number] {
  return {
    id: MAP_3D_BUILDING_LAYER_ID,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 12.6,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': [
        'interpolate',
        ['linear'],
        MAP_3D_BUILDING_HEIGHT_EXPRESSION,
        0,
        '#FF0072',
        24,
        '#FF4DB0',
        58,
        '#A64DFF',
        104,
        '#6F00FF',
        170,
        '#3826FF',
        260,
        '#1181FF',
        420,
        '#00D5FF',
      ],
      'fill-extrusion-height': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12.8,
        0,
        13.4,
        ['*', MAP_3D_BUILDING_HEIGHT_EXPRESSION, 0.45],
        14.2,
        MAP_3D_BUILDING_HEIGHT_EXPRESSION,
      ],
      'fill-extrusion-base': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12.8,
        0,
        13.4,
        MAP_3D_BUILDING_BASE_EXPRESSION,
      ],
      'fill-extrusion-opacity': 0.88,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

const MAP_3D_BUILDING_LIGHT: StyleSpecification['light'] = {
  anchor: 'viewport',
  color: '#f2edf8',
  intensity: 0.36,
  position: [1.2, 210, 35],
};

type MapLibreModule = typeof import('maplibre-gl');
type MapLibreExport = MapLibreModule['default'];

let mapLibreModulePromise: Promise<MapLibreModule> | null = null;
let confettiModulePromise: Promise<typeof import('canvas-confetti')> | null = null;

function loadMapLibre() {
  mapLibreModulePromise ??= import('maplibre-gl');
  return mapLibreModulePromise;
}

function playEventMarkerConfetti() {
  confettiModulePromise ??= import('canvas-confetti');

  return confettiModulePromise.then(({ default: confetti }) => confetti({
    particleCount: 36,
    spread: 54,
    startVelocity: 28,
    origin: { y: 0.56 },
    scalar: 0.72,
  }));
}

export function createRasterStyle(tileUrls: string[], attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      osmRasterTiles: {
        type: 'raster',
        tiles: tileUrls,
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      {
        id: 'osm-raster-tiles',
        type: 'raster',
        source: 'osmRasterTiles',
      },
    ],
  };
}

function createDefaultRasterStyle() {
  return createConfiguredRasterStyle();
}

function canFallbackToDefaultRasterStyle(style: ReturnType<typeof getMapStyle>) {
  if (typeof style === 'string') {
    return false;
  }

  return Boolean(style.sources?.openmaptiles) && !style.sources?.osmRasterTiles;
}

function isEnabledEnvFlag(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function createConfiguredRasterStyle() {
  const configuredTileUrl = import.meta.env.VITE_MAP_TILE_URL?.trim();
  const configuredAttribution = import.meta.env.VITE_MAP_ATTRIBUTION?.trim();

  return createRasterStyle(
    configuredTileUrl ? [configuredTileUrl] : DEFAULT_TILE_URLS,
    configuredAttribution || DEFAULT_ATTRIBUTION,
  );
}

async function loadMapLabelFonts() {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return;
  }

  const fontFaceSet = document.fonts;

  await Promise.allSettled([
    fontFaceSet.load(`400 24px "${MAP_LABEL_FONT_FAMILY}"`),
    fontFaceSet.load(`700 24px "${MAP_LABEL_FONT_FAMILY}"`),
    fontFaceSet.ready,
  ]);
}

export function createCruushVectorStyle(
  tileJsonUrl = DEFAULT_VECTOR_TILEJSON_URL,
  glyphsUrl?: string,
  enable3dBuildings = false,
): StyleSpecification {
  return {
    version: 8,
    ...(glyphsUrl ? { glyphs: glyphsUrl } : {}),
    ...(enable3dBuildings ? { light: MAP_3D_BUILDING_LIGHT } : {}),
    sources: {
      openmaptiles: {
        type: 'vector',
        url: tileJsonUrl,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#050506',
        },
      },
      {
        id: 'landcover-base',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: {
          'fill-color': '#1c1c22',
          'fill-opacity': 0.92,
        },
      },
      {
        id: 'landuse-blocks',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        paint: {
          'fill-color': [
            'match',
            ['get', 'class'],
            ['residential', 'commercial', 'industrial'],
            '#212128',
            '#1c1c22',
          ],
          'fill-outline-color': '#2e2e38',
        },
      },
      ...(enable3dBuildings ? [create3dBuildingLayer()] : []),
      {
        id: 'minor-roads',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: [
          'match',
          ['get', 'class'],
          ['minor', 'service', 'track', 'path'],
          true,
          false,
        ],
        paint: {
          'line-color': '#38383f',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 2.2],
          'line-opacity': 0.95,
        },
      },
      {
        id: 'major-roads',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: [
          'match',
          ['get', 'class'],
          ['primary', 'secondary', 'tertiary', 'trunk'],
          true,
          false,
        ],
        paint: {
          'line-color': '#4c4c56',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 16, 5.5],
          'line-opacity': 0.98,
        },
      },
      {
        id: 'major-road-dashes',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: [
          'match',
          ['get', 'class'],
          ['primary', 'secondary', 'tertiary', 'trunk'],
          true,
          false,
        ],
        paint: {
          'line-color': ['match', ['get', 'class'], 'trunk', '#5c5c68', '#4a4a54'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.45, 16, 1.4],
          'line-dasharray': [1.2, 2.4],
          'line-opacity': 0.75,
        },
      },
      {
        id: 'road-marking-dashes',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 15,
        filter: ['==', ['get', 'class'], 'minor'],
        paint: {
          'line-color': '#282828',
          'line-width': 0.5,
          'line-dasharray': [1, 2.2],
          'line-opacity': 0.55,
        },
      },
      {
        id: 'minor-road-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 12,
        filter: [
          'match',
          ['get', 'class'],
          ['minor', 'service', 'track', 'path'],
          true,
          false,
        ],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 120,
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': MAP_LABEL_FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 16, 12],
          'text-letter-spacing': 0.02,
          'text-padding': 1,
        },
        paint: {
          'text-color': '#9c9ca4',
          'text-halo-color': '#050506',
          'text-halo-width': 1,
        },
      },
      {
        id: 'secondary-road-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 12,
        filter: [
          'match',
          ['get', 'class'],
          ['secondary', 'tertiary'],
          true,
          false,
        ],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': MAP_LABEL_FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
          'text-letter-spacing': 0.025,
          'text-padding': 2,
        },
        paint: {
          'text-color': '#b4b4bc',
          'text-halo-color': '#050506',
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'primary-road-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 10,
        filter: ['==', ['get', 'class'], 'primary'],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': MAP_LABEL_FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 16, 15],
          'text-letter-spacing': 0.03,
          'text-padding': 2,
        },
        paint: {
          'text-color': '#dcdce2',
          'text-halo-color': '#050506',
          'text-halo-width': 1.4,
        },
      },
      {
        id: 'prominent-road-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 9,
        filter: ['==', ['get', 'class'], 'trunk'],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': MAP_LABEL_FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 13, 16, 16],
          'text-letter-spacing': 0.035,
          'text-padding': 2,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#050506',
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 8,
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': MAP_LABEL_FONT_BOLD,
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            13,
            12,
            17,
          ],
          'text-letter-spacing': 0.035,
          'text-padding': 4,
        },
        paint: {
          'text-color': '#eaeaef',
          'text-halo-color': '#050506',
          'text-halo-width': 1.6,
        },
      },
    ],
  };
}

export function getMapStyle(enable3dBuildings = isEnabledEnvFlag(import.meta.env.VITE_MAP_ENABLE_3D_BUILDINGS)) {
  const configuredStyleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim();

  if (configuredStyleUrl) {
    return configuredStyleUrl;
  }

  if (isEnabledEnvFlag(import.meta.env.VITE_MAP_USE_RASTER_TILES)) {
    return createConfiguredRasterStyle();
  }

  const configuredVectorTileJsonUrl = import.meta.env.VITE_MAP_VECTOR_TILEJSON_URL?.trim();
  const configuredGlyphsUrl = import.meta.env.VITE_MAP_GLYPHS_URL?.trim();

  return createCruushVectorStyle(
    configuredVectorTileJsonUrl || DEFAULT_VECTOR_TILEJSON_URL,
    configuredGlyphsUrl || undefined,
    enable3dBuildings,
  );
}

type RenderedMapMarker = {
  marker: MapLibreMarker;
  root: Root;
};

type SpiderfiedCluster = {
  center: {
    approximateLatitude: number;
    approximateLongitude: number;
  };
  memberIds: string[];
};

type DisplayMapMarker = MapMarker & {
  spiderfy?: {
    offset: PointLike;
    index: number;
    count: number;
  };
};

function isMapMarker(value: MapMarker) {
  return Number.isFinite(value.approximateLatitude) && Number.isFinite(value.approximateLongitude);
}

function isPersonCluster(marker: MapMarker) {
  return marker.kind === 'cluster' && marker.cluster?.kind === 'people';
}

function isSpiderfyCluster(marker: MapMarker) {
  return isPersonCluster(marker) && marker.cluster?.action === 'spiderfy';
}

function getDisplayName(marker: MapMarker) {
  return marker.displayName.trim() || 'person';
}

function getClusterLabel(count: number) {
  return `${count} nearby ${count === 1 ? 'person' : 'people'}`;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function mercatorPixelPoint(marker: MapMarker, zoom: number) {
  const worldSize = 512 * 2 ** zoom;
  const latRadians = marker.approximateLatitude * Math.PI / 180;
  const sinLatitude = Math.min(0.9999, Math.max(-0.9999, Math.sin(latRadians)));

  return {
    x: (marker.approximateLongitude + 180) / 360 * worldSize,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize,
  };
}

function coordinateKey(marker: Pick<MapMarker, 'approximateLatitude' | 'approximateLongitude'>) {
  return `${marker.approximateLatitude.toFixed(SAME_LOCATION_CLUSTER_PRECISION)}:${marker.approximateLongitude.toFixed(SAME_LOCATION_CLUSTER_PRECISION)}`;
}

function groupMarkersByCoordinate(markers: MapMarker[]) {
  return markers.reduce((groups, marker) => {
    const key = coordinateKey(marker);
    const group = groups.get(key) ?? [];
    group.push(marker);
    groups.set(key, group);
    return groups;
  }, new Map<string, MapMarker[]>());
}

function canClusterMarker(marker: MapMarker, focusCoordinates: MapViewProps['focusCoordinates']) {
  if ((marker.kind ?? 'person') !== 'person' || marker.isCurrentUser === true) {
    return false;
  }

  if (!focusCoordinates) {
    return true;
  }

  return (
    Math.abs(marker.approximateLatitude - focusCoordinates.approximateLatitude) > 0.000001 ||
    Math.abs(marker.approximateLongitude - focusCoordinates.approximateLongitude) > 0.000001
  );
}

function buildPeopleCluster(group: MapMarker[], index: number, action: 'zoom' | 'spiderfy' = 'zoom'): MapMarker {
  const sortedIds = group.map((marker) => marker.id).sort();
  const count = group.length;
  const label = getClusterLabel(count);
  const clusterHash = hashString(sortedIds.join('|'));
  const averageLatitude = group.reduce((sum, marker) => sum + marker.approximateLatitude, 0) / count;
  const averageLongitude = group.reduce((sum, marker) => sum + marker.approximateLongitude, 0) / count;

  return {
    id: `people-cluster-${index}-${clusterHash}`,
    kind: 'cluster',
    displayName: label,
    approximateLatitude: averageLatitude,
    approximateLongitude: averageLongitude,
    cluster: {
      id: `people-${index}`,
      count,
      label,
      kind: 'people',
      memberIds: sortedIds,
      action,
    },
  };
}

function getSpiderfyOffsets(count: number) {
  return Array.from({ length: count }, (_, index): PointLike => {
    const isSecondRing = count > SPIDERFY_SECOND_RING_AFTER && index >= SPIDERFY_SECOND_RING_AFTER;
    const ringIndex = isSecondRing ? index - SPIDERFY_SECOND_RING_AFTER : index;
    const ringCount = isSecondRing ? count - SPIDERFY_SECOND_RING_AFTER : Math.min(count, SPIDERFY_SECOND_RING_AFTER);
    const radius = isSecondRing ? SPIDERFY_SECOND_RING_RADIUS_PX : SPIDERFY_RADIUS_PX;
    const angle = -Math.PI / 2 + (ringIndex / Math.max(1, ringCount)) * Math.PI * 2;

    return [
      Number((Math.cos(angle) * radius).toFixed(2)),
      Number((Math.sin(angle) * radius).toFixed(2)),
    ];
  });
}

function getSpiderfiedMarkerMap(markers: MapMarker[], spiderfiedCluster: SpiderfiedCluster | null) {
  if (!spiderfiedCluster || spiderfiedCluster.memberIds.length < 2) {
    return new Map<string, DisplayMapMarker>();
  }

  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  const members = spiderfiedCluster.memberIds
    .map((memberId) => markersById.get(memberId))
    .filter((marker): marker is MapMarker => Boolean(marker));

  if (members.length < 2 || new Set(members.map(coordinateKey)).size !== 1) {
    return new Map<string, DisplayMapMarker>();
  }

  const offsets = getSpiderfyOffsets(members.length);

  return new Map(members.map((marker, index) => [
    marker.id,
    {
      ...marker,
      spiderfy: {
        offset: offsets[index],
        index,
        count: members.length,
      },
    },
  ]));
}

function applyPersonMarkerClusters(
  markers: MapMarker[],
  zoom: number,
  focusCoordinates: MapViewProps['focusCoordinates'],
  spiderfiedCluster: SpiderfiedCluster | null,
): DisplayMapMarker[] {
  const spiderfiedMarkersById = getSpiderfiedMarkerMap(markers, spiderfiedCluster);
  const spiderfiedIds = new Set(spiderfiedMarkersById.keys());

  const clusteredIds = new Set<string>();
  const clusterableMarkers = markers
    .filter((marker) => canClusterMarker(marker, focusCoordinates))
    .filter((marker) => !spiderfiedIds.has(marker.id));
  const clusters: MapMarker[] = [];
  const sameLocationGroups = Array.from(groupMarkersByCoordinate(clusterableMarkers).values())
    .filter((group) => group.length >= 2);

  sameLocationGroups.forEach((group) => {
    group.forEach((marker) => clusteredIds.add(marker.id));
    clusters.push(buildPeopleCluster(group, clusters.length, 'spiderfy'));
  });

  if (zoom >= PERSON_CLUSTER_MAX_ZOOM) {
    return [
      ...markers
        .filter((marker) => !clusteredIds.has(marker.id))
        .map((marker) => spiderfiedMarkersById.get(marker.id) ?? marker),
      ...clusters,
    ];
  }

  clusterableMarkers.forEach((seed) => {
    if (clusteredIds.has(seed.id)) {
      return;
    }

    const seedPoint = mercatorPixelPoint(seed, zoom);
    const group = clusterableMarkers.filter((candidate) => {
      if (clusteredIds.has(candidate.id)) {
        return false;
      }

      const candidatePoint = mercatorPixelPoint(candidate, zoom);
      return Math.hypot(candidatePoint.x - seedPoint.x, candidatePoint.y - seedPoint.y) <= PERSON_CLUSTER_RADIUS_PX;
    });

    if (group.length < 2) {
      return;
    }

    group.forEach((marker) => clusteredIds.add(marker.id));
    clusters.push(buildPeopleCluster(group, clusters.length));
  });

  return [
    ...markers
      .filter((marker) => !clusteredIds.has(marker.id))
      .map((marker) => spiderfiedMarkersById.get(marker.id) ?? marker),
    ...clusters,
  ];
}

function isHeatmapMarker(marker: MapMarker) {
  return (
    (marker.kind ?? 'person') === 'person' &&
    marker.isCurrentUser !== true &&
    marker.npcGhostDemo !== true &&
    isMapMarker(marker)
  );
}

function createUserHeatmapFeatureCollection(markers: MapMarker[]) {
  return {
    type: 'FeatureCollection' as const,
    features: markers
      .filter(isHeatmapMarker)
      .map((marker) => ({
        type: 'Feature' as const,
        properties: {
          weight: 1,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [marker.approximateLongitude, marker.approximateLatitude],
        },
      })),
  };
}

function getHeatmapBeforeLayerId(map: MapLibreMap) {
  if (typeof map.getStyle !== 'function') {
    return undefined;
  }

  return map.getStyle().layers?.find((layer) => MAP_DETAIL_LAYER_TYPES.has(layer.type))?.id;
}

function get3dBuildingBeforeLayerId(map: MapLibreMap) {
  if (typeof map.getStyle !== 'function') {
    return undefined;
  }

  const layers = map.getStyle().layers ?? [];

  return (
    layers.find((layer) => layer.id === 'minor-roads')?.id ??
    layers.find((layer) => MAP_DETAIL_LAYER_TYPES.has(layer.type))?.id
  );
}

function canSync3dBuildingsInPlace(map: MapLibreMap, style: ReturnType<typeof getMapStyle>) {
  if (typeof style === 'string' || typeof map.getStyle !== 'function') {
    return false;
  }

  return Boolean(style.sources?.openmaptiles && map.getStyle().sources?.openmaptiles);
}

function sync3dBuildingsInPlace(map: MapLibreMap, enabled: boolean, style: ReturnType<typeof getMapStyle>) {
  if (
    !canSync3dBuildingsInPlace(map, style) ||
    typeof map.getLayer !== 'function' ||
    typeof map.addLayer !== 'function' ||
    typeof map.removeLayer !== 'function'
  ) {
    return false;
  }

  if (map.getLayer(MAP_3D_BUILDING_LAYER_ID)) {
    map.removeLayer(MAP_3D_BUILDING_LAYER_ID);
  }

  if (enabled) {
    map.addLayer(create3dBuildingLayer(), get3dBuildingBeforeLayerId(map));
    if (typeof (map as { setLight?: (light: StyleSpecification['light']) => void }).setLight === 'function') {
      (map as { setLight: (light: StyleSpecification['light']) => void }).setLight(MAP_3D_BUILDING_LIGHT);
    }
  }

  return true;
}

function truncateMarkerPreview(value: string | null | undefined, maxCharacters = 30) {
  const normalizedValue = (value ?? '').trim().replace(/\s+/g, ' ');

  if (normalizedValue.length <= maxCharacters) {
    return normalizedValue;
  }

  const clippedValue = normalizedValue
    .slice(0, maxCharacters)
    .replace(/\s+\S*$/, '')
    .trim();

  return `${clippedValue || normalizedValue.slice(0, maxCharacters).trim()}...`;
}

function shouldReduceMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const POSITION_BADGE_ICONS: Record<string, LucideIcon> = {
  bottom: ArrowDown,
  side: MoveHorizontal,
  'pillow princess': Bed,
  'stone top': Mountain,
  top: ArrowUp,
  'vers bottom': ArrowDown,
  'vers top': ArrowUp,
  versatile: Repeat2,
  none: MinusCircle,
  unknown: CircleDot,
};

function getBadgeIcon(badge: MapMarkerBadge | null | undefined) {
  if (!badge?.iconName) {
    return null;
  }

  return POSITION_BADGE_ICONS[badge.iconName] ?? null;
}

function getHeartSideBadgeClass(side: 'left' | 'right', isCurrentUser: boolean) {
  const edgeClass = side === 'left' ? 'left-[0.375rem]' : 'right-[0.375rem]';
  return `${edgeClass} top-[42%] -translate-y-1/2 z-20`;
}

function MarkerBadge({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  const badge = marker.badge;
  const Icon = getBadgeIcon(badge);

  if (!isCurrentUser && (!badge || !Icon)) {
    return null;
  }

  const borderClass = isCurrentUser
    ? 'border-[#0BA8FF]/80'
    : marker.relationship?.kind === 'mutual_cruush'
      ? 'border-[#6f00ff]/80'
      : 'border-[#FF0072]/80';

  return (
    <span
      aria-label={isCurrentUser ? 'Your profile' : badge?.label}
      className={[
        'cruush-glass-soft absolute flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full border bg-black/85 text-white shadow-[0_4px_14px_rgba(0,0,0,0.55)] backdrop-blur-md transition-transform duration-150',
        getHeartSideBadgeClass('right', isCurrentUser),
        borderClass,
      ].join(' ')}
      data-testid={`marker-badge-${marker.id}`}
      role="img"
      title={isCurrentUser ? 'Your profile' : badge?.label}
    >
      {isCurrentUser ? (
        <User aria-hidden="true" className="h-[1.0625rem] w-[1.0625rem]" strokeWidth={2.6} />
      ) : Icon ? (
        <Icon aria-hidden="true" className="h-[0.9375rem] w-[0.9375rem]" strokeWidth={2.6} />
      ) : null}
    </span>
  );
}

function MarkerRelationshipBadge({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  if (marker.relationship?.kind !== 'mutual_cruush') {
    return null;
  }

  const precisionLabel = marker.relationship.precision === 'precise'
    ? 'precise mutual cruush location'
    : marker.relationship.precision === 'fuzzy'
      ? 'fuzzy mutual cruush location'
      : 'mutual cruush';
  const title = marker.relationship.precision === 'precise'
    ? 'precise mutual location'
    : marker.relationship.precision === 'fuzzy'
      ? 'fuzzy mutual location'
      : 'mutual cruush';

  return (
    <span
      aria-label={precisionLabel}
      className={[
        'cruush-glass-soft absolute flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full border border-[#6f00ff]/80 bg-black/85 text-white/78 shadow-[0_4px_14px_rgba(0,0,0,0.55)] backdrop-blur-md transition-transform duration-150',
        getHeartSideBadgeClass('left', isCurrentUser),
      ].join(' ')}
      data-testid={`marker-relationship-${marker.id}`}
      role="img"
      title={title}
    >
      <CruushIcon name="safety" className="h-[1.171875rem] w-[1.171875rem] opacity-85" variant="white" />
    </span>
  );
}

function MarkerHeart({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  const resolvedPhoto = resolveMediaUrl(marker.photo);
  const hasPhoto = Boolean(resolvedPhoto);
  const gradientId = `marker-fill-${marker.id}`;
  const clipId = `marker-photo-clip-${marker.id}`;
  const isMutualCruush = marker.relationship?.kind === 'mutual_cruush';
  const isNpcGhostDemo = marker.npcGhostDemo === true;
  const theme = isCurrentUser || isNpcGhostDemo ? 'current' : isMutualCruush ? 'mutual' : 'nearby';
  const markerTheme = HEART_PIN_THEMES[theme];
  const [gradientFrom, gradientMiddle, gradientTo] = hasPhoto || isCurrentUser || isNpcGhostDemo || isMutualCruush
    ? markerTheme.stops
    : getProfileGradientStops(marker.userId ?? marker.id);

  // DL Mode: overlay a deterministic gradient on top of explicit (NSFW) photos
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  const showExplicitGradientOverlay = Boolean(marker.photoExplicit && dlModeActive && hasPhoto);

  return (
    <svg
      aria-hidden="true"
      className="cruush-heart-glass-svg h-20 w-20"
      data-testid={`marker-heart-${marker.id}`}
      data-has-photo={hasPhoto ? 'true' : 'false'}
      data-current-user={isCurrentUser ? 'true' : 'false'}
      data-marker-theme={isNpcGhostDemo ? 'npc-ghost-demo' : theme}
      height="80"
      viewBox="0 0 64 64"
      width="80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" x2="55" y1="9" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={gradientFrom} />
          <stop offset="52%" stopColor={gradientMiddle} />
          <stop offset="100%" stopColor={gradientTo} />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={HEART_PIN_PHOTO_PATH} />
        </clipPath>
      </defs>
      <path className="cruush-heart-glass-base" d={HEART_PIN_PATH} fill={`url(#${gradientId})`} stroke={`url(#${gradientId})`} strokeWidth="3.2" />
      {hasPhoto ? (
        <image
          clipPath={`url(#${clipId})`}
          data-testid={`marker-photo-fill-${marker.id}`}
          height="64"
          href={resolvedPhoto}
          preserveAspectRatio="xMidYMid slice"
          width="64"
        />
      ) : null}

      {/* When DL Mode is active and the photo is explicit, render a gradient overlay above the image */}
      {showExplicitGradientOverlay ? (
        <path
          d={HEART_PIN_PATH}
          fill={`url(#${gradientId})`}
          className="marker-explicit-overlay"
          data-testid={`marker-explicit-gradient-${marker.id}`}
          style={{ opacity: 0.96 }}
        />
      ) : null}

      <path className="cruush-heart-glass-refraction" d={HEART_PIN_PATH} />
      <path className="cruush-heart-glass-theme-border" d={HEART_PIN_PATH} stroke={`url(#${gradientId})`} />
      <path className="cruush-heart-glass-rim" d={HEART_PIN_PATH} />
      <path className="cruush-heart-glass-edge cruush-heart-glass-edge-magenta" d={HEART_PIN_PATH} />
      <path className="cruush-heart-glass-edge cruush-heart-glass-edge-cyan" d={HEART_PIN_PATH} />
      <path className="cruush-heart-glass-lip" d={HEART_PIN_PATH} />
      <path className="cruush-heart-glass-specular" d={HEART_PIN_PATH} />
    </svg>
  );
}

const MAP_COUNT_MARKER_CLASS = 'cruush-glass-pill flex h-16 w-16 min-w-0 shrink-0 items-center justify-center overflow-hidden rounded-full px-0 text-center text-[1.15rem] font-semibold leading-none text-white tabular-nums backdrop-blur-md';

function formatMapCountMarkerLabel(count: number) {
  return count > 999 ? '999+' : count;
}

function VenueClusterMarker({ marker }: { marker: MapMarker }) {
  const count = marker.cluster?.count ?? 0;

  return (
    <span
      className={`${MAP_COUNT_MARKER_CLASS} border border-white/20 bg-black/82 shadow-[0_0_28px_rgba(255,0,114,0.34)]`}
      data-testid={`venue-cluster-marker-${marker.cluster?.id ?? marker.id}`}
    >
      {formatMapCountMarkerLabel(count)}
    </span>
  );
}

function PeopleClusterMarker({ marker }: { marker: MapMarker }) {
  const count = marker.cluster?.count ?? 0;

  return (
    <span
      className={`${MAP_COUNT_MARKER_CLASS} border border-primary/40 bg-black/86 shadow-[0_0_34px_rgba(255,0,114,0.44)]`}
      data-testid={`people-cluster-marker-${marker.cluster?.id ?? marker.id}`}
    >
      {formatMapCountMarkerLabel(count)}
    </span>
  );
}

function LaunchPartyMarker({ marker }: { marker: MapMarker }) {
  const attendeeCount = marker.event?.attendeeCount ?? 0;

  return (
    <span
      className={`${MAP_COUNT_MARKER_CLASS} border border-white/20 bg-black/82 shadow-[0_0_28px_rgba(255,0,114,0.34)]`}
      data-testid={`launch-party-marker-${marker.id}`}
    >
      {formatMapCountMarkerLabel(attendeeCount)}
    </span>
  );
}

function MapMarkerPin({
  marker,
  mobileSignalActive = false,
  mobileSignalPreview = false,
}: {
  marker: MapMarker;
  mobileSignalActive?: boolean;
  mobileSignalPreview?: boolean;
}) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser === true;
  const isPersonMarker = (marker.kind ?? 'person') === 'person';
  const signalPreview = isPersonMarker ? truncateMarkerPreview(marker.signal, mobileSignalPreview ? 42 : 30) : '';
  const postPreview = isPersonMarker ? truncateMarkerPreview(marker.latestFeedPostPreview, mobileSignalPreview ? 42 : 30) : '';
  const mobileSignalLabel = isCurrentUser ? 'You' : signalPreview || postPreview;
  const showMobileSignal = mobileSignalPreview && Boolean(mobileSignalLabel) && (mobileSignalActive || isCurrentUser);
  const markerScaleClass = mobileSignalActive
    ? 'scale-110'
    : 'group-hover:scale-150 group-focus-within:scale-150';

  if (marker.kind === 'cluster') {
    return isPersonCluster(marker) ? <PeopleClusterMarker marker={marker} /> : <VenueClusterMarker marker={marker} />;
  }

  if (marker.kind === 'event') {
    return <LaunchPartyMarker marker={marker} />;
  }

  return (
    <span className="group pointer-events-none relative flex h-[88px] w-[103px] items-start justify-center overflow-visible">
      <span className={`relative flex h-20 w-[103px] origin-bottom items-center justify-center transition-transform duration-150 ${markerScaleClass}`}>
        {marker.npcGhostDemo ? (
          <span
            aria-hidden="true"
            className="absolute h-[5.625rem] w-[5.625rem] rounded-full border border-[#0BA8FF]/70 bg-[#0BA8FF]/10 shadow-[0_0_28px_rgba(11,168,255,0.42)]"
            data-testid={`marker-npc-ghost-halo-${marker.id}`}
          />
        ) : null}
        <MarkerHeart marker={marker} isCurrentUser={isCurrentUser} />
        <MarkerBadge marker={marker} isCurrentUser={isCurrentUser} />
        <MarkerRelationshipBadge marker={marker} isCurrentUser={isCurrentUser} />
      </span>
      {showMobileSignal ? (
        <span
          className="cruush-glass-pill pointer-events-none absolute left-1/2 top-0 z-30 flex w-max max-w-[min(12rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-[calc(100%+0.75rem)] items-center gap-1.5 rounded-full border border-white/28 bg-white/[0.13] px-3 py-1.5 text-left text-[0.82rem] font-semibold leading-none text-white shadow-[0_10px_28px_rgba(0,0,0,0.36)] backdrop-blur-md"
          data-testid={`marker-mobile-signal-${marker.id}`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.85)]" />
          <span className="min-w-0 truncate">{mobileSignalLabel}</span>
        </span>
      ) : null}
      {!showMobileSignal && (signalPreview || postPreview) ? (
        <span className="absolute left-1/2 top-0 z-20 flex w-max max-w-[16rem] -translate-x-1/2 -translate-y-full flex-col items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          {signalPreview ? (
            <span className="cruush-glass-pill rounded-full border border-white/12 bg-black/86 px-3 py-1 text-center text-[0.7rem] font-semibold leading-tight text-white shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
              {signalPreview}
            </span>
          ) : null}
          {postPreview ? (
            <span className="cruush-glass-pill rounded-full border border-primary/20 bg-black/86 px-3 py-1 text-center text-[0.7rem] font-semibold leading-tight text-primary shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
              {postPreview}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function isMapClickFromMarker(event: unknown) {
  const target = (event as { originalEvent?: { target?: EventTarget | null } } | undefined)?.originalEvent?.target;

  return target instanceof Element && Boolean(target.closest('[data-map-marker-pin="true"]'));
}

function createMarkerElement(
  marker: DisplayMapMarker,
  onPinClick: (marker: MapMarker) => void,
  onMarkerInteraction: () => void,
  {
    mobileSignalActive = false,
    mobileSignalPreview = false,
    onMobileSignalPreview,
  }: {
    mobileSignalActive?: boolean;
    mobileSignalPreview?: boolean;
    onMobileSignalPreview?: (marker: MapMarker) => void;
  } = {},
) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser;
  const isInteractive = !isCurrentUser || marker.kind === 'event' || marker.kind === 'cluster';
  const isMobileSignalPreviewMarker = mobileSignalPreview && (marker.kind ?? 'person') === 'person' && !isCurrentUser;
  const element = document.createElement(isInteractive ? 'button' : 'div');
  const name = getDisplayName(marker);
  const animationHint = marker.animationHint ?? 'NONE';

  element.className = [
    'group relative flex h-[88px] w-[103px] items-start justify-center overflow-visible border-0 bg-transparent p-0 transition-opacity duration-700',
    animationHint === 'FADE_LAST_MINUTE' ? 'opacity-45' : '',
    animationHint === 'SIGNAL_LOSS' ? 'opacity-15 animate-pulse' : '',
    animationHint === 'REAPPEAR' ? 'opacity-100' : '',
  ].filter(Boolean).join(' ');
  element.dataset.animationHint = animationHint;
  element.dataset.displayMode = marker.displayMode ?? 'PRECISE';
  element.dataset.mapMarkerPin = 'true';
  element.dataset.mapMarkerKind = marker.kind ?? 'person';

  if (marker.spiderfy) {
    element.dataset.spiderfied = 'true';
    element.dataset.spiderfyIndex = String(marker.spiderfy.index);
    element.dataset.spiderfyCount = String(marker.spiderfy.count);
    element.style.zIndex = String(30 + marker.spiderfy.index);
  }

  if (mobileSignalActive) {
    element.dataset.mobileSignalActive = 'true';
    element.style.zIndex = '60';
  }

  if (!isInteractive) {
    element.setAttribute('aria-label', 'Your approximate area');
  } else {
    const button = element as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-label', marker.kind === 'event'
      ? `Open ${marker.event?.venueName ?? name} launch party on map`
      : marker.kind === 'cluster'
      ? isSpiderfyCluster(marker)
        ? `Open ${marker.cluster?.label ?? name} sharing this map spot`
        : isPersonCluster(marker)
        ? `Zoom into ${marker.cluster?.label ?? name} on map`
        : `Open ${marker.cluster?.label ?? name} on map`
      : isMobileSignalPreviewMarker && !mobileSignalActive
      ? `Preview ${name} signal on map`
      : isMobileSignalPreviewMarker
      ? `Open ${name} profile`
      : `Open ${name} on map`);
    const recordMarkerInteraction = (event: Event) => {
      event.stopPropagation();
      onMarkerInteraction();
    };

    button.addEventListener('pointerdown', recordMarkerInteraction);
    button.addEventListener('mousedown', recordMarkerInteraction);
    button.addEventListener('touchstart', recordMarkerInteraction);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onMarkerInteraction();
      if (isMobileSignalPreviewMarker && !mobileSignalActive) {
        onMobileSignalPreview?.(marker);
        return;
      }

      if (marker.kind === 'event' && !shouldReduceMotion()) {
        void playEventMarkerConfetti().catch(() => {
          // Confetti is decorative; marker selection must keep working.
        });
      }
      onPinClick(marker);
    });
  }

  const root = createRoot(element);
  flushSync(() => {
    root.render(
      <MapMarkerPin
        marker={marker}
        mobileSignalActive={mobileSignalActive}
        mobileSignalPreview={mobileSignalPreview}
      />
    );
  });

  return { element, root };
}

function createCircleFeature({ center, radiusMeters }: RadiusCircle) {
  const points: number[][] = [];
  const steps = 96;
  const lat = center.approximateLatitude;
  const lng = center.approximateLongitude;
  const lngScale = Math.max(0.01, Math.abs(Math.cos(lat * Math.PI / 180)));

  for (let index = 0; index <= steps; index += 1) {
    const theta = (index / steps) * Math.PI * 2;
    const northMeters = Math.cos(theta) * radiusMeters;
    const eastMeters = Math.sin(theta) * radiusMeters;
    points.push([
      lng + eastMeters / (111_320 * lngScale),
      lat + northMeters / 111_320,
    ]);
  }

  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [points],
    },
  };
}

function createCircleFeatureCollection(circles: RadiusCircle[]) {
  return {
    type: 'FeatureCollection' as const,
    features: circles.map(createCircleFeature),
  };
}

function createCirclePolygon(center: RadiusCircle['center'], radiusMeters: number) {
  return createCircleFeatureCollection([{ center, radiusMeters }]);
}

function cleanupRenderedMarker({ marker, root }: RenderedMapMarker) {
  marker.remove();
  queueMicrotask(() => root.unmount());
}

function MapView({
  onPinClick,
  onMapClick,
  onMapReady,
  markers,
  mobileSignalPreview = false,
  enable3dBuildings = isEnabledEnvFlag(import.meta.env.VITE_MAP_ENABLE_3D_BUILDINGS),
  heatmapEnabled = true,
  onHeatmapAvailabilityChange,
  fitToMarkers = false,
  focusCoordinates,
  radiusCircle,
  demoRadiusCircles = [],
  denseVenue = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<RenderedMapMarker[]>([]);
  const viewportMarkersRef = useRef<MapMarker[]>([]);
  const demoRadiusCirclesRef = useRef<RadiusCircle[]>([]);
  const mapLibreRef = useRef<MapLibreExport | null>(null);
  const autoFitFocusKeyRef = useRef<string | null>(null);
  const hasAppliedAutoFitRef = useRef(false);
  const directFocusRef = useRef<{ map: MapLibreMap; key: string } | null>(null);
  const onPinClickRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);
  const onMapReadyRef = useRef(onMapReady);
  const onHeatmapAvailabilityChangeRef = useRef(onHeatmapAvailabilityChange);
  const lastMarkerInteractionAtRef = useRef(0);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [mapLoadStatus, setMapLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapError, setMapError] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [spiderfiedCluster, setSpiderfiedCluster] = useState<SpiderfiedCluster | null>(null);
  const [mobileSignalMarkerId, setMobileSignalMarkerId] = useState<string | null>(null);
  const mapStyle = useMemo(() => getMapStyle(enable3dBuildings), [enable3dBuildings]);
  const initial3dMapModeRef = useRef(enable3dBuildings);
  const applied3dMapModeRef = useRef(enable3dBuildings);
  const initialMapStyleRef = useRef(mapStyle);
  const appliedMapStyleRef = useRef(mapStyle);
  const denseMarkerResult = useMemo(
    () => applyDenseVenueMarkers(markers, denseVenue, currentZoom),
    [currentZoom, denseVenue, markers],
  );
  const focusLatitude = focusCoordinates?.approximateLatitude ?? null;
  const focusLongitude = focusCoordinates?.approximateLongitude ?? null;
  const renderedMarkers = useMemo(
    () => applyPersonMarkerClusters(denseMarkerResult.markers, currentZoom, focusCoordinates, spiderfiedCluster),
    [currentZoom, denseMarkerResult.markers, focusCoordinates, spiderfiedCluster],
  );
  useEffect(() => {
    if (!mobileSignalMarkerId) {
      return;
    }

    if (!mobileSignalPreview || !renderedMarkers.some((marker) => marker.id === mobileSignalMarkerId)) {
      setMobileSignalMarkerId(null);
    }
  }, [mobileSignalMarkerId, mobileSignalPreview, renderedMarkers]);
  const heatmapData = useMemo(() => createUserHeatmapFeatureCollection(markers), [markers]);
  const heatmapFeatureSignature = useMemo(() => heatmapData.features
    .map((feature) => feature.geometry.coordinates.map((coordinate) => coordinate.toFixed(6)).join(':'))
    .join('|'), [heatmapData]);
  const viewportMarkerSignature = useMemo(() => renderedMarkers
    .filter(isMapMarker)
    .map((marker) => [
      marker.id,
      marker.approximateLatitude.toFixed(6),
      marker.approximateLongitude.toFixed(6),
    ].join(':'))
    .sort()
    .join('|'), [renderedMarkers]);
  const demoRadiusCircleSignature = useMemo(() => demoRadiusCircles
    .map((circle, index) => [
      index,
      circle.center.approximateLatitude.toFixed(6),
      circle.center.approximateLongitude.toFixed(6),
      Math.round(circle.radiusMeters),
    ].join(':'))
    .join('|'), [demoRadiusCircles]);

  useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    onHeatmapAvailabilityChangeRef.current = onHeatmapAvailabilityChange;
  }, [onHeatmapAvailabilityChange]);

  useEffect(() => {
    onHeatmapAvailabilityChangeRef.current?.(heatmapData.features.length > 0);
  }, [heatmapData.features.length]);

  useEffect(() => {
    viewportMarkersRef.current = renderedMarkers.filter(isMapMarker);
  }, [renderedMarkers]);

  useEffect(() => {
    demoRadiusCirclesRef.current = demoRadiusCircles;
  }, [demoRadiusCircles]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let isMounted = true;
    let attemptedRasterFallback = false;
    const initialMapStyle = initialMapStyleRef.current;
    const initial3dMapMode = initial3dMapModeRef.current;
    const shouldFallbackToRaster = canFallbackToDefaultRasterStyle(initialMapStyle);
    setMapLoadStatus('loading');
    setMapError(null);

    const initializeMap = async () => {
      const [mapLibreModule] = await Promise.all([
        loadMapLibre(),
        loadMapLabelFonts(),
      ]);

      if (!isMounted || !containerRef.current || mapRef.current) {
        return;
      }

      const maplibregl = mapLibreModule.default;
      mapLibreRef.current = maplibregl;

      const startMap = (style: ReturnType<typeof getMapStyle>, isFallbackAttempt = false) => {
        if (!isMounted || !containerRef.current) {
          return;
        }

        let didLoad = false;
        let readyFallbackTimeout: ReturnType<typeof window.setTimeout> | null = null;
        let renderReadyTimeout: ReturnType<typeof window.setTimeout> | null = null;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: DEFAULT_CENTER,
          zoom: initial3dMapMode ? DEFAULT_3D_BUILDINGS_ZOOM : DEFAULT_ZOOM,
          pitch: initial3dMapMode ? MAP_3D_BUILDINGS_PITCH : 0,
          bearing: initial3dMapMode ? MAP_3D_BUILDINGS_BEARING : 0,
          ...(initial3dMapMode ? { canvasContextAttributes: { antialias: true } } : {}),
          minZoom: MIN_DISCOVERY_ZOOM,
          maxBounds: NYC_METRO_MAX_BOUNDS,
          renderWorldCopies: false,
          attributionControl: false,
        });
        mapRef.current = map;
        setMapInstance(map);

        const clearReadyFallbackTimeout = () => {
          if (readyFallbackTimeout == null) {
            return;
          }

          window.clearTimeout(readyFallbackTimeout);
          readyFallbackTimeout = null;
        };

        const clearRenderReadyTimeout = () => {
          if (renderReadyTimeout == null) {
            return;
          }

          window.clearTimeout(renderReadyTimeout);
          renderReadyTimeout = null;
        };

        const restartWithRasterFallback = () => {
          attemptedRasterFallback = true;
          clearReadyFallbackTimeout();
          clearRenderReadyTimeout();
          setMapLoadStatus('loading');
          setMapError(null);
          map.remove();
          mapRef.current = null;
          setMapInstance(null);
          startMap(createDefaultRasterStyle(), true);
        };

        const markMapReady = () => {
          if (!isMounted || mapRef.current !== map) {
            return;
          }

          didLoad = true;
          clearReadyFallbackTimeout();
          clearRenderReadyTimeout();
          if (typeof map.getZoom === 'function') {
            setCurrentZoom(map.getZoom());
          }
          setMapLoadStatus('ready');
          setMapError(null);
        };

        const scheduleRenderedReady = () => {
          if (didLoad || renderReadyTimeout != null) {
            return;
          }

          if (shouldFallbackToRaster && !isFallbackAttempt) {
            return;
          }

          renderReadyTimeout = window.setTimeout(() => {
            renderReadyTimeout = null;

            if (!isMounted || mapRef.current !== map || didLoad) {
              return;
            }

            markMapReady();
          }, MAP_RENDER_READY_TIMEOUT_MS);
        };

        if (shouldFallbackToRaster && !isFallbackAttempt && !attemptedRasterFallback) {
          readyFallbackTimeout = window.setTimeout(() => {
            if (!isMounted || mapRef.current !== map || didLoad || attemptedRasterFallback) {
              return;
            }

            restartWithRasterFallback();
          }, MAP_READY_FALLBACK_TIMEOUT_MS);
        }

        map.on('click', (event) => {
          const markerInteractionWasRecent = Date.now() - lastMarkerInteractionAtRef.current < MARKER_INTERACTION_SUPPRESS_MS;

          if (markerInteractionWasRecent || isMapClickFromMarker(event)) {
            return;
          }

          setSpiderfiedCluster(null);
          setMobileSignalMarkerId(null);
          onMapClickRef.current?.();
        });
        map.on('zoomend', () => {
          setSpiderfiedCluster(null);
          if (typeof map.getZoom === 'function') {
            setCurrentZoom(map.getZoom());
          }
        });
        map.on('load', markMapReady);
        map.on('idle', markMapReady);
        map.on('render', scheduleRenderedReady);
        map.on('error', (event) => {
          if (!isMounted || mapRef.current !== map) {
            return;
          }

          if (didLoad) {
            console.warn('Nonfatal map tile error after load:', event);
            return;
          }

          if (shouldFallbackToRaster && !isFallbackAttempt && !attemptedRasterFallback) {
            restartWithRasterFallback();
            return;
          }

          clearReadyFallbackTimeout();
          setMapLoadStatus('error');
          setMapError(MAP_ERROR_MESSAGE);
        });
        onMapReadyRef.current?.(map);
      };

      try {
        startMap(initialMapStyle);
      } catch (error) {
        if (shouldFallbackToRaster && !attemptedRasterFallback) {
          attemptedRasterFallback = true;
          try {
            startMap(createDefaultRasterStyle(), true);
            return;
          } catch (fallbackError) {
            console.error('Error initializing fallback map:', fallbackError);
          }
        }

        console.error('Error initializing map:', error);
        setMapLoadStatus('error');
        setMapError('Map could not start. Check the map style or tile URL configuration.');
      }
    };

    void initializeMap();

    return () => {
      isMounted = false;
      markersRef.current.forEach(cleanupRenderedMarker);
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, []);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!map) {
      return;
    }

    const styleChanged = appliedMapStyleRef.current !== mapStyle;
    const modeChanged = applied3dMapModeRef.current !== enable3dBuildings;

    if (!styleChanged && !modeChanged) {
      return;
    }

    try {
      const synced3dLayerInPlace = styleChanged
        ? sync3dBuildingsInPlace(map, enable3dBuildings, mapStyle)
        : true;

      if (styleChanged && !synced3dLayerInPlace && typeof map.setStyle === 'function') {
        setMapLoadStatus('loading');
        setMapError(null);
        map.setStyle(mapStyle);
      }

      appliedMapStyleRef.current = mapStyle;
      applied3dMapModeRef.current = enable3dBuildings;

      const currentMapZoom = typeof map.getZoom === 'function' ? map.getZoom() : currentZoom;
      const nextZoom = enable3dBuildings
        ? Math.max(currentMapZoom, DEFAULT_3D_BUILDINGS_ZOOM)
        : currentMapZoom;
      const nextPitch = enable3dBuildings ? MAP_3D_BUILDINGS_PITCH : 0;
      const nextBearing = enable3dBuildings ? MAP_3D_BUILDINGS_BEARING : 0;

      if (typeof map.easeTo === 'function') {
        map.easeTo({
          zoom: nextZoom,
          pitch: nextPitch,
          bearing: nextBearing,
          duration: 450,
          essential: true,
        });
      } else {
        if (typeof map.setPitch === 'function') {
          map.setPitch(nextPitch);
        }
        if (typeof map.setBearing === 'function') {
          map.setBearing(nextBearing);
        }
        if (nextZoom !== currentMapZoom && typeof map.setZoom === 'function') {
          map.setZoom(nextZoom);
        }
      }

      if (nextZoom !== currentMapZoom) {
        setCurrentZoom(nextZoom);
      }
    } catch (error) {
      console.error('Error updating 3D map mode:', error);
      setMapLoadStatus('error');
      setMapError(MAP_ERROR_MESSAGE);
    }
  }, [currentZoom, enable3dBuildings, mapInstance, mapStyle]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!map || focusLatitude == null || focusLongitude == null) {
      directFocusRef.current = null;
      return;
    }

    const visibleMarkers = viewportMarkersRef.current;
    const focusKey = `${focusLatitude.toFixed(6)}:${focusLongitude.toFixed(6)}`;

    if (fitToMarkers) {
      directFocusRef.current = null;
      if (autoFitFocusKeyRef.current !== focusKey) {
        autoFitFocusKeyRef.current = focusKey;
        hasAppliedAutoFitRef.current = false;
      } else if (hasAppliedAutoFitRef.current) {
        return;
      }
    } else {
      autoFitFocusKeyRef.current = null;
      hasAppliedAutoFitRef.current = false;
      if (directFocusRef.current?.map === map && directFocusRef.current.key === focusKey) {
        return;
      }
    }

    if (fitToMarkers && visibleMarkers.length > 1 && typeof map.fitBounds === 'function') {
      const coordinates = [
        ...visibleMarkers.map((marker) => ({
          lat: marker.approximateLatitude,
          lng: marker.approximateLongitude,
        })),
        {
          lat: focusLatitude,
          lng: focusLongitude,
        },
      ];
      const lats = coordinates.map((coordinate) => coordinate.lat);
      const lngs = coordinates.map((coordinate) => coordinate.lng);

      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        {
          padding: {
            top: 140,
            right: 120,
            bottom: 170,
            left: 120,
          },
          maxZoom: enable3dBuildings ? FOCUSED_3D_BUILDINGS_ZOOM : FOCUSED_ZOOM,
          duration: 500,
        }
      );
      hasAppliedAutoFitRef.current = true;
      return;
    }

    map.setCenter([focusLongitude, focusLatitude]);
    map.setZoom(enable3dBuildings ? FOCUSED_3D_BUILDINGS_ZOOM : FOCUSED_ZOOM);
    directFocusRef.current = { map, key: focusKey };
  }, [enable3dBuildings, fitToMarkers, focusLatitude, focusLongitude, mapInstance, viewportMarkerSignature]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!map || mapLoadStatus !== 'ready') {
      return;
    }

    const sourceId = 'owner-ghost-radius';
    const fillLayerId = 'owner-ghost-radius-fill';
    const lineLayerId = 'owner-ghost-radius-line';
    const getLayer = typeof map.getLayer === 'function' ? map.getLayer.bind(map) : () => undefined;
    const getSource = typeof map.getSource === 'function' ? map.getSource.bind(map) : () => undefined;
    const removeLayer = typeof map.removeLayer === 'function' ? map.removeLayer.bind(map) : null;
    const removeSource = typeof map.removeSource === 'function' ? map.removeSource.bind(map) : null;

    if (!radiusCircle) {
      if (getLayer(lineLayerId) && removeLayer) {
        removeLayer(lineLayerId);
      }
      if (getLayer(fillLayerId) && removeLayer) {
        removeLayer(fillLayerId);
      }
      if (getSource(sourceId) && removeSource) {
        removeSource(sourceId);
      }
      return;
    }

    const data = createCirclePolygon(radiusCircle.center, radiusCircle.radiusMeters);
    const existingSource = getSource(sourceId) as GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(data);
      return;
    }

    if (typeof map.addSource !== 'function' || typeof map.addLayer !== 'function') {
      return;
    }

    map.addSource(sourceId, {
      type: 'geojson',
      data,
    });
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#1181FF',
        'fill-opacity': 0.14,
      },
    });
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#1181FF',
        'line-opacity': 0.88,
        'line-width': 2.5,
      },
    });
  }, [mapInstance, mapLoadStatus, radiusCircle]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!map || mapLoadStatus !== 'ready') {
      return;
    }

    const sourceId = 'npc-ghost-demo-radii';
    const fillLayerId = 'npc-ghost-demo-radii-fill';
    const lineLayerId = 'npc-ghost-demo-radii-line';
    const getLayer = typeof map.getLayer === 'function' ? map.getLayer.bind(map) : () => undefined;
    const getSource = typeof map.getSource === 'function' ? map.getSource.bind(map) : () => undefined;
    const removeLayer = typeof map.removeLayer === 'function' ? map.removeLayer.bind(map) : null;
    const removeSource = typeof map.removeSource === 'function' ? map.removeSource.bind(map) : null;
    const circles = demoRadiusCirclesRef.current;

    if (circles.length === 0) {
      if (getLayer(lineLayerId) && removeLayer) {
        removeLayer(lineLayerId);
      }
      if (getLayer(fillLayerId) && removeLayer) {
        removeLayer(fillLayerId);
      }
      if (getSource(sourceId) && removeSource) {
        removeSource(sourceId);
      }
      return;
    }

    const data = createCircleFeatureCollection(circles);
    const existingSource = getSource(sourceId) as GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(data);
      return;
    }

    if (typeof map.addSource !== 'function' || typeof map.addLayer !== 'function') {
      return;
    }

    map.addSource(sourceId, {
      type: 'geojson',
      data,
    });
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#0BA8FF',
        'fill-opacity': 0.045,
      },
    });
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#0BA8FF',
        'line-opacity': 0.38,
        'line-width': 1.2,
      },
    });
  }, [demoRadiusCircleSignature, mapInstance, mapLoadStatus]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!map || mapLoadStatus !== 'ready') {
      return;
    }

    const getLayer = typeof map.getLayer === 'function' ? map.getLayer.bind(map) : () => undefined;
    const getSource = typeof map.getSource === 'function' ? map.getSource.bind(map) : () => undefined;
    const removeLayer = typeof map.removeLayer === 'function' ? map.removeLayer.bind(map) : null;
    const removeSource = typeof map.removeSource === 'function' ? map.removeSource.bind(map) : null;

    if (!heatmapEnabled || heatmapData.features.length === 0) {
      if (getLayer(USER_HEATMAP_LAYER_ID) && removeLayer) {
        removeLayer(USER_HEATMAP_LAYER_ID);
      }
      if (getSource(USER_HEATMAP_SOURCE_ID) && removeSource) {
        removeSource(USER_HEATMAP_SOURCE_ID);
      }
      return;
    }

    const existingSource = getSource(USER_HEATMAP_SOURCE_ID) as GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(heatmapData);
      return;
    }

    if (typeof map.addSource !== 'function' || typeof map.addLayer !== 'function') {
      return;
    }

    map.addSource(USER_HEATMAP_SOURCE_ID, {
      type: 'geojson',
      data: heatmapData,
    });

    const heatmapLayer = {
      id: USER_HEATMAP_LAYER_ID,
      type: 'heatmap' as const,
      source: USER_HEATMAP_SOURCE_ID,
      maxzoom: 16.75,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1.25],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1.35, 14, 2.65, 16, 3.4],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 34, 14, 68, 16, 96],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0.34, 13, 0.58, 16.75, 0.52],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(255, 0, 114, 0)',
          0.06,
          'rgba(17, 129, 255, 0.45)',
          0.22,
          'rgba(0, 75, 255, 0.68)',
          0.42,
          'rgba(56, 38, 255, 0.78)',
          0.62,
          'rgba(111, 0, 255, 0.88)',
          0.82,
          'rgba(255, 0, 114, 0.94)',
          1,
          'rgba(255, 64, 163, 1)',
        ],
      },
    };
    const beforeId = getHeatmapBeforeLayerId(map);

    if (beforeId) {
      map.addLayer(heatmapLayer, beforeId);
    } else {
      map.addLayer(heatmapLayer);
    }
  }, [heatmapEnabled, heatmapFeatureSignature, mapInstance, mapLoadStatus]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    const maplibregl = mapLibreRef.current;

    if (!map || !maplibregl) {
      return;
    }

    markersRef.current.forEach(cleanupRenderedMarker);
    markersRef.current = [];

    const visibleMarkers = renderedMarkers.filter(isMapMarker);
    let cancelled = false;
    const previewMobileSignal = (selectedMarker: MapMarker) => {
      const nextZoom = Math.max(
        typeof map.getZoom === 'function' ? map.getZoom() : currentZoom,
        MOBILE_SIGNAL_PREVIEW_ZOOM,
      );
      const center: [number, number] = [
        selectedMarker.approximateLongitude,
        selectedMarker.approximateLatitude,
      ];

      setSpiderfiedCluster(null);
      setMobileSignalMarkerId(selectedMarker.id);
      if (typeof map.easeTo === 'function') {
        map.easeTo({
          center,
          zoom: nextZoom,
          duration: shouldReduceMotion() ? 0 : 420,
          essential: true,
        });
      } else {
        map.setCenter(center);
        map.setZoom(nextZoom);
      }
      setCurrentZoom(nextZoom);
    };

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      markersRef.current = visibleMarkers.map((marker) => {
        const { element, root } = createMarkerElement(
          marker,
          (selectedMarker) => {
            if (isSpiderfyCluster(selectedMarker)) {
              const memberIds = selectedMarker.cluster?.memberIds ?? [];

              if (memberIds.length >= 2) {
                setSpiderfiedCluster({
                  center: {
                    approximateLatitude: selectedMarker.approximateLatitude,
                    approximateLongitude: selectedMarker.approximateLongitude,
                  },
                  memberIds,
                });
              }
              return;
            }

            if (isPersonCluster(selectedMarker)) {
              const nextZoom = Math.min(
                PERSON_CLUSTER_MAX_ZOOM + 0.75,
                Math.max(currentZoom + PERSON_CLUSTER_ZOOM_STEP, PERSON_CLUSTER_MAX_ZOOM + 0.25),
              );
              setSpiderfiedCluster(null);
              map.setCenter([selectedMarker.approximateLongitude, selectedMarker.approximateLatitude]);
              map.setZoom(nextZoom);
              setCurrentZoom(nextZoom);
              return;
            }

            setSpiderfiedCluster(null);
            onPinClickRef.current(selectedMarker);
          },
          () => {
            lastMarkerInteractionAtRef.current = Date.now();
          },
          {
            mobileSignalActive: mobileSignalMarkerId === marker.id,
            mobileSignalPreview,
            onMobileSignalPreview: previewMobileSignal,
          },
        );
        const mapMarker = new maplibregl.Marker({
          element,
          anchor: 'bottom',
          ...(marker.spiderfy ? {
            offset: marker.spiderfy.offset,
            subpixelPositioning: true,
          } : {}),
        })
          .setLngLat([marker.approximateLongitude, marker.approximateLatitude])
          .addTo(map);
        return {
          marker: mapMarker,
          root,
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [currentZoom, mobileSignalMarkerId, mobileSignalPreview, renderedMarkers, mapInstance]);

  return (
    <div className="relative h-full min-h-[400px] w-full overflow-hidden bg-background">
      <div
        ref={containerRef}
        className="cruush-map h-full min-h-[400px] w-full overflow-hidden bg-background"
        data-testid="maplibre-map"
      />
      {mapLoadStatus === 'loading' ? (
        <div className="cruush-glass-soft pointer-events-none absolute left-4 top-4 z-10 rounded-md bg-background/82 px-3 py-2 text-xs text-white/70 backdrop-blur-md">
          Loading NYC map...
        </div>
      ) : null}
      {mapError ? (
        <div className="cruush-glass-soft absolute left-4 right-4 top-4 z-10 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive backdrop-blur-md">
          {mapError}
        </div>
      ) : null}
    </div>
  );
}

export default MapView;
