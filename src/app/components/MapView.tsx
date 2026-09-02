import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import MileHighContrail from './MileHighContrail';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type {
  GeoJSONSource,
  LngLatLike,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  StyleSpecification,
} from 'maplibre-gl';
import {
  BedDouble,
  BookOpen,
  CircleParking,
  Coffee,
  Cross,
  Dumbbell,
  HeartHandshake,
  KeyRound,
  Martini,
  MapPinned,
  Music2,
  Route,
  Shapes,
  ShoppingBag,
  Toilet,
  TrainFront,
  Trees,
  User,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import beachUmbrellaIcon from '../assets/ui-icons/beach-umbrella-1689481.png';
import { CruushIcon, GhostColoredIcon } from './CruushIconImage';
import { resolveMediaUrl } from '../lib/apiClient';
import { getProfileGradientStops } from '../lib/profileGradient';
import { applyDenseVenueMarkers, type DenseVenueConfig } from '../lib/denseVenueMarkers';
import {
  createMapMarkerBadge,
  createMapMarkerRoleBadge,
  type MapMarker,
  type MapMarkerBadge,
} from '../lib/mapMarkers';
import { positionGlyphFor, roleGlyphFor } from './PositionRoleGlyphs';
import {
  BadgeFrame,
  BADGE_INTERACTION_CLASS,
  BadgeHoverLabel,
  MAP_SIDE_BADGE_PLACEMENT_CLASS,
  mapSideBadgeStyle,
  preventBadgeContextMenu,
  type BadgeFrameId,
} from './BadgeFrames';
import { HANKY_COLORS } from './HankyFrame';
import { formatBadgeLabel } from '../lib/badgeIntent';
import { HEART_PIN_PATH, HEART_PIN_THEMES } from '../lib/heartPin';
import { DARK_ROOM_PALETTE } from '../lib/darkRoomPalette';
import { resolveSavedBadgeGlyph } from './SavedBadgeGlyphs';
import {
  DARK_ROOM_EYE_PATH,
  DARK_ROOM_KEYHOLE_PATH,
  DarkRoomKeyholeEyeGraphic,
} from './DarkRoomMark';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import {
  addAccessibilityPreferencesChangedListener,
  getAccessibilityPreferences,
  shouldReduceMotion,
} from '../lib/accessibilityPreferences';
import {
  MAP_SERVICE_CENTER,
  MAP_SERVICE_MAX_BOUNDS,
  MAP_SERVICE_OUTSIDE_MASK,
  createMapOutsideRadiusMask,
  mapServiceMinZoomForViewport,
} from '../lib/mapServiceArea';
import { USER_BORDER_COLORS } from '../lib/userBorderTone';

export { createMapMarkerBadge, createMapMarkerRoleBadge };

type RadiusCircle = {
  center: {
    approximateLatitude: number;
    approximateLongitude: number;
  };
  radiusMeters: number;
};

type GhostLeash = {
  from: RadiusCircle['center'];
  to: RadiusCircle['center'];
};

type BrowseArea = {
  center: RadiusCircle['center'];
  radiusMiles: number;
};

type InitialViewport = {
  center: {
    approximateLatitude: number;
    approximateLongitude: number;
  };
  zoom: number;
};

interface MapViewProps {
  onPinClick: (marker: MapMarker) => void;
  onMapClick?: () => void;
  onMapReady?: (map: MapLibreMap) => void;
  markers: MapMarker[];
  peopleHeatmapEnabled?: boolean;
  fitToMarkers?: boolean;
  focusCoordinates?: {
    approximateLatitude: number;
    approximateLongitude: number;
  } | null;
  initialViewport?: InitialViewport;
  radiusCircle?: RadiusCircle | null;
  browseArea?: BrowseArea | null;
  ghostLeash?: GhostLeash | null;
  demoRadiusCircles?: RadiusCircle[];
  denseVenue?: DenseVenueConfig | null;
}

const DEFAULT_CENTER: LngLatLike = [MAP_SERVICE_CENTER.longitude, MAP_SERVICE_CENTER.latitude];
const DEFAULT_ZOOM = 12;
const FOCUSED_ZOOM = 14;
export const MIN_DISCOVERY_ZOOM = 9.2;
export const MAX_DISCOVERY_ZOOM = 22;
const AUTO_FIT_MAX_ZOOM = 15;
const AUTO_FIT_MIN_ZOOM = 10.5;
const DEFAULT_VECTOR_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const FORBIDDEN_MAP_PROVIDER_PATTERN = /(?:^|\.)cartocdn\.com$/i;
export const CRUUSH_MAP_THEME_LAYER_IDS = [
  'background',
  'landcover-base',
  'landuse-blocks',
  'minor-roads',
  'major-roads',
  'major-road-dashes',
  'road-marking-dashes',
  'minor-road-labels',
  'secondary-road-labels',
  'primary-road-labels',
  'prominent-road-labels',
  'place-labels',
] as const;
const MAP_ERROR_MESSAGE = 'Map tiles could not load. Check the map style or tile URL configuration.';
const MAP_RENDER_READY_TIMEOUT_MS = 1200;
const MOBILE_MARKER_LONG_PRESS_MS = 300;
const MOBILE_MARKER_LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const MAP_LABEL_FONT_FAMILY = 'Cormorant Garamond';
const MAP_LABEL_FONT_REGULAR = ['Cormorant Garamond'];
const MAP_LABEL_FONT_BOLD = ['Cormorant Garamond Bold', 'Cormorant Garamond'];
export const MAP_TILE_LABEL_SCALE = 1.25;
const MAP_ACCESSIBILITY_TEXT_SCALE = 1.25;
export const MAP_PIN_UNIT_SCALE = 1;
const MARKER_INTERACTION_SUPPRESS_MS = 350;
// Clustering hides individual people, so it starts later and gives up sooner:
// pins only merge when they are nearly on top of one another.
// Keep dense map pins grouped while zoomed out. These values match the
// approved map handoff and prevent nearby profile hearts from stacking.
const PERSON_CLUSTER_MAX_ZOOM = 15.25;
const PERSON_CLUSTER_RADIUS_PX = 84;
export const MAP_SERVICE_MASK_SOURCE_ID = 'cruush-map-service-mask';
export const MAP_SERVICE_MASK_LAYER_ID = 'cruush-map-service-mask';
export const MAP_BROWSE_MASK_SOURCE_ID = 'cruush-map-browse-mask';
export const MAP_BROWSE_MASK_LAYER_ID = 'cruush-map-browse-mask';
// Rendered footprint of a heart pin, so no two pins may sit inside one another.
// The complete heart-pin unit renders at 125% of its original footprint.
// Keep neighboring units visibly separate instead of letting badges overlap.
export const MARKER_CLEARANCE_PX = Math.round(112 * MAP_PIN_UNIT_SCALE);
// A signal capsule is far wider than the pin under it and it sits above the
// heart, so two pins can clear each other while their signals still collide.
// A pin whose signal is always on screen, which is what a Pulse does, needs the
// caption's own width to itself.
export const SIGNAL_CLEARANCE_PX = Math.round(268 * MAP_PIN_UNIT_SCALE);
// Markers sharing a spot to this many decimal places are treated as one place
// and collapsed into a cluster that fans out on tap rather than stacking.
const SAME_LOCATION_CLUSTER_PRECISION = 6;
const SPIDERFY_RADIUS_PX = 86;
const SPIDERFY_SECOND_RING_RADIUS_PX = 122;
const SPIDERFY_SECOND_RING_AFTER = 10;
const PLACE_CLUSTER_MAX_ZOOM = 13.5;
const PLACE_CLUSTER_RADIUS_PX = 68;
const USER_HEATMAP_SOURCE_ID = 'cruush-user-heatmap';
const USER_HEATMAP_LAYER_ID = 'cruush-user-heatmap-layer';
// Broad cells plus a minimum cohort keep the activity layer from tracing one
// current heart. At New York latitudes, 0.05 degrees spans several miles.
const USER_HEATMAP_CELL_DEGREES = 0.05;
const USER_HEATMAP_MIN_SAMPLES = 3;
const USER_HEATMAP_WINDOW_MINUTES = 7 * 24 * 60;
const MAP_DETAIL_LAYER_TYPES = new Set(['line', 'symbol']);
const PERSON_CLUSTER_ZOOM_STEP = 1.5;
const ACTIVE_PING_MARKER_Z_INDEX = 100;
const SIGNAL_PREVIEW_MARKER_Z_INDEX = ACTIVE_PING_MARKER_Z_INDEX + 10;

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

function hasActiveMapStyle(map: MapLibreMap | null | undefined): map is MapLibreMap {
  return Boolean(map && (map as MapLibreMap & { style?: unknown }).style);
}

function addMapServiceOutsideMask(map: MapLibreMap) {
  if (
    !hasActiveMapStyle(map)
    || typeof map.getSource !== 'function'
    || typeof map.addSource !== 'function'
    || typeof map.getLayer !== 'function'
    || typeof map.addLayer !== 'function'
  ) {
    return;
  }

  if (!map.getSource(MAP_SERVICE_MASK_SOURCE_ID)) {
    map.addSource(MAP_SERVICE_MASK_SOURCE_ID, {
      type: 'geojson',
      data: MAP_SERVICE_OUTSIDE_MASK,
    });
  }

  if (!map.getLayer(MAP_SERVICE_MASK_LAYER_ID)) {
    map.addLayer({
      id: MAP_SERVICE_MASK_LAYER_ID,
      type: 'fill',
      source: MAP_SERVICE_MASK_SOURCE_ID,
      paint: {
        'fill-antialias': false,
        'fill-color': '#06101F',
        'fill-opacity': 0.9,
      },
    });
  }
}

function moveMapServiceOutsideMaskToTop(map: MapLibreMap) {
  if (!hasActiveMapStyle(map) || typeof map.getLayer !== 'function' || typeof map.moveLayer !== 'function') {
    return;
  }

  for (const layerId of [MAP_SERVICE_MASK_LAYER_ID, MAP_BROWSE_MASK_LAYER_ID]) {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  }
}

function syncMapBrowseOutsideMask(map: MapLibreMap, browseArea: BrowseArea | null | undefined) {
  if (
    !hasActiveMapStyle(map)
    || typeof map.getSource !== 'function'
    || typeof map.getLayer !== 'function'
  ) {
    return;
  }

  if (!browseArea) {
    if (map.getLayer(MAP_BROWSE_MASK_LAYER_ID) && typeof map.removeLayer === 'function') {
      map.removeLayer(MAP_BROWSE_MASK_LAYER_ID);
    }
    if (map.getSource(MAP_BROWSE_MASK_SOURCE_ID) && typeof map.removeSource === 'function') {
      map.removeSource(MAP_BROWSE_MASK_SOURCE_ID);
    }
    return;
  }

  const data = createMapOutsideRadiusMask({
    latitude: browseArea.center.approximateLatitude,
    longitude: browseArea.center.approximateLongitude,
  }, browseArea.radiusMiles);
  const existingSource = map.getSource(MAP_BROWSE_MASK_SOURCE_ID) as GeoJSONSource | undefined;

  if (existingSource) {
    existingSource.setData(data);
  } else if (typeof map.addSource === 'function') {
    map.addSource(MAP_BROWSE_MASK_SOURCE_ID, { type: 'geojson', data });
  }

  if (!map.getLayer(MAP_BROWSE_MASK_LAYER_ID) && typeof map.addLayer === 'function') {
    map.addLayer({
      id: MAP_BROWSE_MASK_LAYER_ID,
      type: 'fill',
      source: MAP_BROWSE_MASK_SOURCE_ID,
      paint: {
        'fill-antialias': false,
        'fill-color': '#06152B',
        'fill-opacity': 0.88,
      },
    });
  }

  moveMapServiceOutsideMaskToTop(map);
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
): StyleSpecification {
  return {
    version: 8,
    ...(glyphsUrl ? { glyphs: glyphsUrl } : {}),
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9 * MAP_TILE_LABEL_SCALE, 16, 12 * MAP_TILE_LABEL_SCALE],
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11 * MAP_TILE_LABEL_SCALE, 16, 14 * MAP_TILE_LABEL_SCALE],
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12 * MAP_TILE_LABEL_SCALE, 16, 15 * MAP_TILE_LABEL_SCALE],
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 13 * MAP_TILE_LABEL_SCALE, 16, 16 * MAP_TILE_LABEL_SCALE],
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
            13 * MAP_TILE_LABEL_SCALE,
            12,
            17 * MAP_TILE_LABEL_SCALE,
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

export function getMapStyle() {
  const configuredVectorTileJsonUrl = import.meta.env.VITE_MAP_VECTOR_TILEJSON_URL?.trim();
  const configuredGlyphsUrl = import.meta.env.VITE_MAP_GLYPHS_URL?.trim();

  const vectorTileJsonUrl = configuredVectorTileJsonUrl || DEFAULT_VECTOR_TILEJSON_URL;
  const vectorTileHost = (() => {
    try {
      return new URL(vectorTileJsonUrl).hostname;
    } catch {
      return '';
    }
  })();

  if (FORBIDDEN_MAP_PROVIDER_PATTERN.test(vectorTileHost)) {
    throw new Error('CARTO map sources are not allowed. cruush must use its approved map theme.');
  }

  const style = createCruushVectorStyle(vectorTileJsonUrl, configuredGlyphsUrl || undefined);
  const layerIds = new Set(style.layers.map((layer) => layer.id));

  if (CRUUSH_MAP_THEME_LAYER_IDS.some((layerId) => !layerIds.has(layerId))) {
    throw new Error('The approved cruush map theme is missing required layers.');
  }

  return style;
}

type RenderedMapMarker = {
  dispose: () => void;
  id: string;
  marker: MapLibreMarker;
  root: Root;
  setPreviewed: (previewed: boolean) => void;
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
    offset: [number, number];
    index: number;
    count: number;
  };
};

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

function getSpiderfyOffsets(count: number): Array<[number, number]> {
  return Array.from({ length: count }, (_, index) => {
    const isSecondRing = count > SPIDERFY_SECOND_RING_AFTER && index >= SPIDERFY_SECOND_RING_AFTER;
    const ringIndex = isSecondRing ? index - SPIDERFY_SECOND_RING_AFTER : index;
    const ringCount = isSecondRing ? count - SPIDERFY_SECOND_RING_AFTER : Math.min(count, SPIDERFY_SECOND_RING_AFTER);
    const radius = isSecondRing ? SPIDERFY_SECOND_RING_RADIUS_PX : SPIDERFY_RADIUS_PX;
    const angle = -Math.PI / 2 + (ringIndex / Math.max(1, ringCount)) * Math.PI * 2;

    return [
      Number((Math.cos(angle) * radius).toFixed(2)),
      Number((Math.sin(angle) * radius).toFixed(2)),
    ] as [number, number];
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
      spiderfy: { offset: offsets[index], index, count: members.length },
    },
  ]));
}

function isMapMarker(value: MapMarker) {
  return Number.isFinite(value.approximateLatitude) && Number.isFinite(value.approximateLongitude);
}

function isPersonCluster(marker: MapMarker) {
  return marker.kind === 'cluster' && marker.cluster?.kind === 'people';
}

function isPlaceCluster(marker: MapMarker) {
  return marker.kind === 'cluster' && marker.cluster?.kind === 'place';
}

function isSpiderfyCluster(marker: MapMarker) {
  return marker.kind === 'cluster' && marker.cluster?.action === 'spiderfy';
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

/**
 * Member coordinates are authoritative display locations. Zoom may replace
 * nearby members with a cluster, but it must never move an individual member.
 * Same-location members can still fan out with pixel-only offsets after the
 * user opens their cluster.
 */
export function separateOverlappingMarkers(markers: MapMarker[], _zoom: number) {
  return markers;
}

function canClusterMarker(marker: MapMarker, focusCoordinates: MapViewProps['focusCoordinates']) {
  // An active Pulse is a short-lived visibility signal. Keep its heart
  // independent from nearby clusters so it stays discoverable while zoomed out.
  if ((marker.kind ?? 'person') !== 'person' || marker.isCurrentUser === true || marker.activePing) {
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

function applyPersonMarkerClusters(
  markers: MapMarker[],
  zoom: number,
  focusCoordinates: MapViewProps['focusCoordinates'],
  spiderfiedCluster: SpiderfiedCluster | null = null,
): DisplayMapMarker[] {
  const spiderfiedMarkersById = getSpiderfiedMarkerMap(markers, spiderfiedCluster);
  const spiderfiedIds = new Set(spiderfiedMarkersById.keys());

  const clusteredIds = new Set<string>();
  const clusterableMarkers = markers
    .filter((marker) => canClusterMarker(marker, focusCoordinates))
    .filter((marker) => !spiderfiedIds.has(marker.id));
  const clusters: MapMarker[] = [];

  // People standing on the exact same spot never separate by zooming, so they
  // collapse into a cluster that fans its members out on tap instead.
  Array.from(groupMarkersByCoordinate(clusterableMarkers).values())
    .filter((group) => group.length >= 2)
    .forEach((group) => {
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

function buildPlaceCluster(
  group: DisplayMapMarker[],
  index: number,
  action: 'zoom' | 'spiderfy' = 'zoom',
): MapMarker {
  const count = group.length;
  const sortedIds = group.map((marker) => marker.id).sort();
  const averageLatitude = group.reduce((sum, marker) => sum + marker.approximateLatitude, 0) / count;
  const averageLongitude = group.reduce((sum, marker) => sum + marker.approximateLongitude, 0) / count;

  return {
    id: `place-cluster-${index}-${hashString(sortedIds.join('|'))}`,
    kind: 'cluster',
    displayName: `${count} spots`,
    approximateLatitude: averageLatitude,
    approximateLongitude: averageLongitude,
    cluster: {
      id: `places-${index}`,
      count,
      label: `${count} spots`,
      kind: 'place',
      memberIds: sortedIds,
      action,
    },
  };
}

function applyPlaceMarkerClusters(markers: DisplayMapMarker[], zoom: number): DisplayMapMarker[] {
  const placeMarkers = markers.filter((marker) => marker.kind === 'place' && !marker.spiderfy);
  const clusteredIds = new Set<string>();
  const clusters: MapMarker[] = [];

  // Spots can share a public coordinate. Keep them selectable at every zoom
  // with the same pixel-only fan-out used for people at an exact coordinate.
  Array.from(groupMarkersByCoordinate(placeMarkers).values())
    .filter((group) => group.length >= 2)
    .forEach((group) => {
      group.forEach((marker) => clusteredIds.add(marker.id));
      clusters.push(buildPlaceCluster(group, clusters.length, 'spiderfy'));
    });

  if (zoom >= PLACE_CLUSTER_MAX_ZOOM) {
    return [...markers.filter((marker) => !clusteredIds.has(marker.id)), ...clusters];
  }

  const points = new Map(placeMarkers.map((marker) => [marker.id, mercatorPixelPoint(marker, zoom)]));
  const buckets = new Map<string, DisplayMapMarker[]>();
  placeMarkers.forEach((marker) => {
    if (clusteredIds.has(marker.id)) return;
    const point = points.get(marker.id)!;
    const key = `${Math.floor(point.x / PLACE_CLUSTER_RADIUS_PX)}:${Math.floor(point.y / PLACE_CLUSTER_RADIUS_PX)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(marker);
    else buckets.set(key, [marker]);
  });

  placeMarkers.forEach((seed) => {
    if (clusteredIds.has(seed.id)) return;
    const seedPoint = points.get(seed.id)!;
    const cellX = Math.floor(seedPoint.x / PLACE_CLUSTER_RADIUS_PX);
    const cellY = Math.floor(seedPoint.y / PLACE_CLUSTER_RADIUS_PX);
    const nearby = [-1, 0, 1].flatMap((xOffset) => (
      [-1, 0, 1].flatMap((yOffset) => buckets.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? [])
    ));
    const group = nearby.filter((candidate) => {
      if (clusteredIds.has(candidate.id)) return false;
      const candidatePoint = points.get(candidate.id)!;
      return Math.hypot(candidatePoint.x - seedPoint.x, candidatePoint.y - seedPoint.y) <= PLACE_CLUSTER_RADIUS_PX;
    });
    if (group.length < 2) return;
    group.forEach((marker) => clusteredIds.add(marker.id));
    clusters.push(buildPlaceCluster(group, clusters.length));
  });

  return [...markers.filter((marker) => !clusteredIds.has(marker.id)), ...clusters];
}

function heatmapActivityIsWithinSevenDays(lastActiveLabel: string | null | undefined) {
  const normalized = lastActiveLabel?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'now' || normalized === 'online') return true;

  const match = normalized.match(/^(\d+)\s*(m|h|d)/);
  if (!match) return false;
  const amount = Number(match[1]);
  const minutes = match[2] === 'd' ? amount * 24 * 60 : match[2] === 'h' ? amount * 60 : amount;
  return minutes <= USER_HEATMAP_WINDOW_MINUTES;
}

function createUserHeatmapFeatureCollection(markers: MapMarker[]) {
  const people = markers.filter((marker) => (
    (marker.kind ?? 'person') === 'person'
    && marker.isCurrentUser !== true
    && marker.npcGhostDemo !== true
    && isMapMarker(marker)
    && heatmapActivityIsWithinSevenDays(marker.lastActiveLabel)
  ));

  const cells = new Map<string, { count: number; latitudeIndex: number; longitudeIndex: number }>();

  people.forEach((marker) => {
    const latitudeIndex = Math.floor(marker.approximateLatitude / USER_HEATMAP_CELL_DEGREES);
    const longitudeIndex = Math.floor(marker.approximateLongitude / USER_HEATMAP_CELL_DEGREES);
    const key = `${latitudeIndex}:${longitudeIndex}`;
    const current = cells.get(key);

    cells.set(key, {
      count: (current?.count ?? 0) + 1,
      latitudeIndex,
      longitudeIndex,
    });
  });

  return {
    type: 'FeatureCollection' as const,
    features: [...cells.values()]
      .filter((cell) => cell.count >= USER_HEATMAP_MIN_SAMPLES)
      .sort((left, right) => (
        left.latitudeIndex - right.latitudeIndex
        || left.longitudeIndex - right.longitudeIndex
      ))
      .map((cell) => ({
      type: 'Feature' as const,
      properties: {
        samples: cell.count,
        weight: Math.min(1, cell.count / 12),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [
          Number(((cell.longitudeIndex + 0.5) * USER_HEATMAP_CELL_DEGREES).toFixed(6)),
          Number(((cell.latitudeIndex + 0.5) * USER_HEATMAP_CELL_DEGREES).toFixed(6)),
        ],
      },
    })),
  };
}

function getHeatmapBeforeLayerId(map: MapLibreMap) {
  if (typeof map.getStyle !== 'function') return undefined;
  return map.getStyle()?.layers?.find((layer) => MAP_DETAIL_LAYER_TYPES.has(layer.type))?.id;
}

// The preview spends its whole character budget. Trimming back to the last whole
// word used to cost up to a third of the characters a signal is allowed.
function truncateMarkerPreview(value: string | null | undefined, maxCharacters = 35) {
  const normalizedValue = (value ?? '').trim().replace(/\s+/g, ' ');

  if (normalizedValue.length <= maxCharacters) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxCharacters).trimEnd()}...`;
}

const MILE_HIGH_SKY_BLUE = USER_BORDER_COLORS['mile-high'];
const OWNER_GHOST_DECOY_FADE_MASK = 'linear-gradient(to bottom, #000 0%, #000 50%, rgba(0,0,0,0.1) 100%)';

function ownerGhostDecoyFadeStyle(marker: MapMarker, isCurrentUser: boolean): CSSProperties {
  if (!isCurrentUser || marker.displayMode !== 'GHOST') {
    return {};
  }

  return {
    WebkitMaskImage: OWNER_GHOST_DECOY_FADE_MASK,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskImage: OWNER_GHOST_DECOY_FADE_MASK,
    maskRepeat: 'no-repeat',
    maskSize: '100% 100%',
  };
}

function getMarkerBorderColor(marker: MapMarker, isCurrentUser: boolean) {
  if (marker.travelling === true) {
    return MILE_HIGH_SKY_BLUE;
  }

  if (marker.activePing) {
    return '#C8FF31';
  }

  if (isCurrentUser && marker.ownerStealthActive) {
    return DARK_ROOM_PALETTE.middle;
  }

  if ((isCurrentUser && marker.displayMode === 'GHOST') || marker.npcGhostDemo) {
    return '#0BA8FF';
  }

  if (isCurrentUser || marker.npcGhostDemo) {
    return '#004BFF';
  }

  return marker.relationship?.kind === 'mutual_cruush'
    ? '#6F00FF'
    : '#FF0072';
}

function getMileHighRingClass(marker: MapMarker) {
  return marker.travelling === true && !marker.activePing ? 'cruush-mile-high-ring' : '';
}

function MarkerSideBadge({
  badge,
  marker,
  isCurrentUser,
  side,
}: {
  badge: MapMarkerBadge | null | undefined;
  marker: MapMarker;
  isCurrentUser: boolean;
  side: 'left' | 'right';
}) {
  if (!badge) {
    return null;
  }

  const savedBadge = resolveSavedBadgeGlyph(badge.badgeId ?? '');
  const Glyph = badge.kind === 'role'
    ? roleGlyphFor(badge.iconName)
    : badge.kind === 'position'
      ? positionGlyphFor(badge.iconName)
      : savedBadge.icon;
  const hanky = badge.badgeId?.startsWith('hanky ')
    ? HANKY_COLORS.find((color) => `hanky ${color.id.replace(/-/g, ' ')}` === badge.badgeId)
    : undefined;

  if (!Glyph && !hanky) {
    return null;
  }

  const badgeBorderColor = getMarkerBorderColor(marker, isCurrentUser);
  const badgeGradientStops = isCurrentUser && marker.ownerStealthActive && marker.travelling !== true
    ? [DARK_ROOM_PALETTE.dark, DARK_ROOM_PALETTE.middle, DARK_ROOM_PALETTE.light] as const
    : undefined;
  const frame: BadgeFrameId = 'circle';
  const hoverLabel = hanky
    ? formatBadgeLabel(hanky.meaning, badge.intent ?? 'none')
    : badge.saved
      ? formatBadgeLabel(savedBadge.label ?? badge.label, badge.intent ?? 'none')
      : badge.label;

  return (
    <span
      aria-label={badge.saved
        ? `${side === 'left' ? 'left' : 'right'} badge: ${hoverLabel}`
        : `${side === 'left' ? 'role' : 'position'}: ${hoverLabel}`}
      className={`group/badge absolute flex items-center justify-center ${MAP_SIDE_BADGE_PLACEMENT_CLASS} ${BADGE_INTERACTION_CLASS}`}
      data-badge-tone={marker.activePing
        ? 'pulse'
        : marker.travelling === true
          ? 'mile-high'
          : isCurrentUser && (marker.ownerStealthActive || marker.displayMode === 'GHOST')
            ? 'special'
            : isCurrentUser
              ? 'current'
              : marker.relationship?.kind === 'mutual_cruush'
                ? 'mutual'
                : 'nearby'}
      data-testid={`marker-${side === 'left' ? 'role' : 'position'}-badge-${marker.id}`}
      role="img"
      onContextMenu={preventBadgeContextMenu}
      tabIndex={0}
      style={{
        color: badgeBorderColor,
        ...mapSideBadgeStyle(side, frame),
        ...ownerGhostDecoyFadeStyle(marker, isCurrentUser),
      }}
    >
      <BadgeFrame
        className="h-full w-full"
        contentScalePercent={savedBadge.fillsFrame ? 84 : undefined}
        frame={frame}
        gradientStops={badgeGradientStops}
        hankyColor={hanky?.color}
        strokeColor={badgeBorderColor}
      >
        {!hanky ? (
          <span className={`flex h-full w-full items-center justify-center text-white ${isCurrentUser && marker.displayMode === 'GHOST' ? 'overflow-hidden rounded-full' : ''}`}>
            <Glyph className="cruush-ghost-rotation-badge-symbol h-full w-full" strokeWidth={2.6} />
          </span>
        ) : null}
      </BadgeFrame>
      <BadgeHoverLabel>{hoverLabel}</BadgeHoverLabel>
    </span>
  );
}

// Ghost pins rotate to a new spot inside their radius every 15 minutes. Through
// the last minute the heart border flashes electric blue at an accelerating
// rate so a viewer can tell this profile is about to move.
const GHOST_PULSE_WINDOW_MS = 60_000;
const GHOST_ROTATION_EXIT_MS = 2_000;

function ghostPulseBeatSchedule() {
  const beats: { t: number; amplitude: number }[] = [];
  let elapsed = 0;

  while (elapsed < 59.55) {
    const progress = elapsed / 60;
    // Flat for the first three quarters, then near vertical: 62bpm up to ~310.
    const beatsPerMinute = 62 + 82 * progress ** 1.5 + 178 * Math.max(0, (progress - 0.72) / 0.28) ** 2.1;
    const interval = 60 / beatsPerMinute;
    const amplitude = progress < 0.55
      ? 0.68 + progress * 0.72
      : progress < 0.86 ? 1.08 : Math.max(0.62, 1.08 - (progress - 0.86) * 2.4);

    beats.push({ t: elapsed, amplitude });
    elapsed += interval;
  }

  return beats;
}

const GHOST_PULSE_BEATS = ghostPulseBeatSchedule();

// The border flash is gated to a fixed on-window per beat rather than to the
// summed contraction, so the pin keeps alternating purple and electric blue
// through the accelerating end of the minute instead of sitting solid blue.
function ghostFlashOn(elapsedSeconds: number) {
  for (let index = GHOST_PULSE_BEATS.length - 1; index >= 0; index -= 1) {
    const beat = GHOST_PULSE_BEATS[index];
    const delta = elapsedSeconds - beat.t;

    if (delta < 0) {
      continue;
    }

    const next = GHOST_PULSE_BEATS[index + 1];
    const intervalMs = ((next ? next.t : beat.t + 0.2) - beat.t) * 1000;
    const onMs = Math.min(220, Math.max(60, intervalMs * 0.45));

    return delta * 1000 < onMs;
  }

  return false;
}

function ghostPulseContraction(elapsedSeconds: number) {
  let total = 0;

  for (const beat of GHOST_PULSE_BEATS) {
    const delta = elapsedSeconds - beat.t;

    if (delta < 0) {
      break;
    }

    if (delta > 0.42) {
      continue;
    }

    // S1 then S2: the second sound lands 155ms later at 40% of the first.
    total += beat.amplitude * (delta < 0.038 ? delta / 0.038 : Math.exp(-(delta - 0.038) / 0.072));
    const second = delta - 0.155;

    if (second > 0 && second < 0.26) {
      total += beat.amplitude * 0.4 * (second < 0.026 ? second / 0.026 : Math.exp(-(second - 0.026) / 0.05));
    }
  }

  return total;
}

const GHOST_PULSE_PEAK_CONTRACTION = (() => {
  let peak = 0;

  for (let sample = 0; sample < 6000; sample += 1) {
    peak = Math.max(peak, ghostPulseContraction(sample / 100));
  }

  return peak;
})();

export function ghostPulseScale(elapsedSeconds: number) {
  if (elapsedSeconds >= 59.55) {
    return 0.83;
  }

  // The resting size sags as the chamber stops refilling, so the swing widens
  // from roughly 1.0-1.35 early to 0.83-1.5 at the end without the peak moving.
  const resting = 1 - 0.17 * (elapsedSeconds / 60) ** 1.25;
  const normalized = Math.min(1, ghostPulseContraction(elapsedSeconds) / GHOST_PULSE_PEAK_CONTRACTION);

  return resting + normalized * (1.5 - resting);
}

function GhostRotationFlyIcon({ id, style }: { id: string; style?: CSSProperties }) {
  return (
    <GhostColoredIcon
      className="cruush-ghost-rotation-fly-icon absolute left-1/2 top-1/2 z-40 h-[4.39875rem] w-[4.39875rem] overflow-visible"
      data-testid={`marker-ghost-fly-icon-${id}`}
      style={style}
    />
  );
}

function GhostRotationPuff({ id, style }: { id: string; style?: CSSProperties }) {
  return (
    <span aria-hidden="true" className="cruush-ghost-rotation-puff-cloud absolute inset-0 z-20" data-testid={`marker-ghost-puff-${id}`} style={style}>
      <span className="cruush-ghost-fog-wisp absolute left-[18%] top-[43%] h-8 w-8" />
      <span className="cruush-ghost-fog-wisp absolute left-[34%] top-[23%] h-9 w-10" />
      <span className="cruush-ghost-fog-wisp absolute right-[16%] top-[44%] h-8 w-9" />
      <span className="cruush-ghost-fog-wisp absolute bottom-[10%] left-[36%] h-7 w-10" />
      <span className="cruush-ghost-fog-wisp absolute left-[12%] top-[22%] h-6 w-7" />
      <span className="cruush-ghost-fog-wisp absolute right-[10%] top-[25%] h-7 w-8" />
    </span>
  );
}

function formatGhostRotationCountdown(expiresAtMs: number, nowMs: number) {
  const secondsRemaining = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1_000));
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function GhostRotationCountdown({ expiresAtMs }: { expiresAtMs?: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (typeof expiresAtMs !== 'number') return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [expiresAtMs]);

  return (
    <span data-testid="owner-ghost-rotation-countdown">
      {typeof expiresAtMs === 'number'
        ? `Rotates in ${formatGhostRotationCountdown(expiresAtMs, nowMs)}`
        : 'Ghost Mode decoy'}
    </span>
  );
}

function GhostRotationPulse({ marker, children }: { marker: MapMarker; children: (exitActive: boolean, exitStyle?: CSSProperties) => ReactNode }) {
  const expiresAtMs = marker.ghostRotationExpiresAtMs;
  const mountedAtMsRef = useRef(Date.now());
  const suppressedMountDeadlineRef = useRef<number | null>(
    marker.displayMode === 'GHOST' &&
    marker.animationHint === 'FADE_LAST_MINUTE' &&
    typeof expiresAtMs === 'number' &&
    expiresAtMs > mountedAtMsRef.current &&
    expiresAtMs - mountedAtMsRef.current <= GHOST_PULSE_WINDOW_MS
      ? expiresAtMs
      : null,
  );
  const canAnimate = marker.displayMode === 'GHOST' &&
    marker.animationHint === 'FADE_LAST_MINUTE' &&
    typeof expiresAtMs === 'number' &&
    expiresAtMs !== suppressedMountDeadlineRef.current &&
    !shouldReduceMotion();
  const [exitElapsedMs, setExitElapsedMs] = useState<number | null>(null);
  const pulseRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!canAnimate || typeof expiresAtMs !== 'number') return;
    const remainingMs = expiresAtMs - Date.now();
    const exitStartMs = remainingMs - GHOST_ROTATION_EXIT_MS;
    if (exitStartMs <= 0 && remainingMs > 0) {
      setExitElapsedMs(Math.min(GHOST_ROTATION_EXIT_MS, -exitStartMs));
    }
    // A page load inside the exit window already resumed the animation part way
    // through above. Scheduling this with a clamped delay fired it immediately
    // and restarted the poof from zero, so the exit replayed on every load.
    const exitTimer = exitStartMs > 0
      ? window.setTimeout(() => setExitElapsedMs(0), exitStartMs)
      : null;
    const endTimer = window.setTimeout(() => setExitElapsedMs(null), Math.max(0, remainingMs));
    return () => {
      if (exitTimer !== null) {
        window.clearTimeout(exitTimer);
      }
      window.clearTimeout(endTimer);
    };
  }, [canAnimate, expiresAtMs]);

  useEffect(() => {
    const node = pulseRef.current;

    if (!canAnimate || !node || typeof expiresAtMs !== 'number') {
      return;
    }

    const effectHost = node.parentElement ?? node;

    let frame = 0;
    // Driven from the rotation deadline rather than from mount, so a re-render
    // or a pan back into view resumes mid-beat instead of restarting the minute.
    const step = () => {
      const remainingMs = expiresAtMs - Date.now();
      const elapsedSeconds = (GHOST_PULSE_WINDOW_MS - remainingMs) / 1000;
      // The flash stops the instant the exit starts so the pin poofs and the
      // ghost flies from its own purple state instead of holding electric blue.
      const inExit = remainingMs <= GHOST_ROTATION_EXIT_MS;

      if (elapsedSeconds >= 0 && elapsedSeconds < 60 && !inExit) {
        const visibleFlash = ghostFlashOn(elapsedSeconds) ? 1 : 0;
        effectHost.style.setProperty('--cruush-ghost-border-opacity', visibleFlash.toFixed(4));
        if (visibleFlash) {
          effectHost.style.setProperty('--cruush-ghost-flash-border-color', '#0BA8FF');
        } else {
          effectHost.style.removeProperty('--cruush-ghost-flash-border-color');
        }
        effectHost.style.setProperty(
          '--cruush-ghost-heart-border-color',
          visibleFlash ? '#0BA8FF' : 'var(--cruush-ghost-heart-base-border)',
        );
        effectHost.style.setProperty(
          '--cruush-ghost-badge-border-color',
          visibleFlash ? '#0BA8FF' : 'var(--cruush-ghost-badge-base-border)',
        );
        effectHost.style.setProperty(
          '--cruush-ghost-signal-border-color',
          visibleFlash ? '#0BA8FF' : 'rgba(255, 255, 255, 0.12)',
        );
        effectHost.style.setProperty('--cruush-ghost-material-opacity', '1');
        effectHost.style.setProperty('--cruush-ghost-unit-opacity', '1');
        // The apparition reads through the map on flash frames, so the photo,
        // the badge symbols, and the signal all drop opacity together.
        effectHost.style.setProperty('--cruush-ghost-photo-opacity', visibleFlash ? '0.62' : '1');
        effectHost.style.setProperty('--cruush-ghost-photo-echo-opacity', '0');
        effectHost.style.setProperty('--cruush-ghost-badge-opacity', '1');
        effectHost.style.setProperty('--cruush-ghost-pepper-opacity', '1');
        if (visibleFlash) {
          effectHost.style.setProperty('--cruush-ghost-surface-alpha', '0.34');
        } else {
          effectHost.style.removeProperty('--cruush-ghost-surface-alpha');
        }
        effectHost.style.setProperty('--cruush-ghost-photo-filter', 'none');
        effectHost.style.setProperty('--cruush-ghost-pepper-filter', 'none');
      } else {
        effectHost.style.setProperty('--cruush-ghost-border-opacity', '0');
        effectHost.style.removeProperty('--cruush-ghost-flash-border-color');
        effectHost.style.setProperty('--cruush-ghost-heart-border-color', 'var(--cruush-ghost-heart-base-border)');
        effectHost.style.setProperty('--cruush-ghost-badge-border-color', 'var(--cruush-ghost-badge-base-border)');
        effectHost.style.setProperty('--cruush-ghost-signal-border-color', 'rgba(255, 255, 255, 0.12)');
        effectHost.style.setProperty('--cruush-ghost-material-opacity', '1');
        effectHost.style.setProperty('--cruush-ghost-unit-opacity', '1');
        effectHost.style.setProperty('--cruush-ghost-photo-opacity', '1');
        effectHost.style.setProperty('--cruush-ghost-photo-echo-opacity', '0');
        effectHost.style.setProperty('--cruush-ghost-badge-opacity', '1');
        effectHost.style.setProperty('--cruush-ghost-photo-filter', 'none');
        effectHost.style.setProperty('--cruush-ghost-pepper-filter', 'none');
        effectHost.style.setProperty('--cruush-ghost-pepper-opacity', '1');
        effectHost.style.removeProperty('--cruush-ghost-surface-alpha');
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [canAnimate, expiresAtMs]);

  const exitActive = exitElapsedMs != null;
  const exitStyle = exitActive ? ({ '--cruush-ghost-rotation-exit-delay': `${-exitElapsedMs}ms` } as CSSProperties) : undefined;

  return (
    <span
      className="relative flex h-20 w-[103px] origin-bottom items-center justify-center"
      data-ghost-rotation-exit={exitActive ? 'true' : 'false'}
      data-testid={canAnimate ? `marker-ghost-pulse-${marker.id}` : undefined}
      ref={pulseRef}
    >
      {exitActive ? <GhostRotationPuff id={marker.id} style={exitStyle} /> : null}
      {exitActive ? <GhostRotationFlyIcon id={marker.id} style={exitStyle} /> : null}
      {children(exitActive, exitStyle)}
    </span>
  );
}


function MarkerHeart({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  const isOwnStealthMarker = isCurrentUser && marker.ownerStealthActive === true;
  const visiblePhoto = marker.photo && !shouldMaskPhoto(dlModeActive, marker.photoExplicit)
    ? resolveMediaUrl(marker.photo)
    : null;
  const resolvedPhoto = !isOwnStealthMarker ? visiblePhoto : null;
  const darkRoomPhoto = isOwnStealthMarker ? visiblePhoto : null;
  const hasPhoto = Boolean(resolvedPhoto);
  const gradientId = `marker-fill-${marker.id}`;
  const clipId = `marker-photo-clip-${marker.id}`;
  const stealthEyeClipId = `marker-dark-room-eye-clip-${marker.id}`;
  const stealthKeyholeMaskId = `marker-dark-room-keyhole-mask-${marker.id}`;
  const stealthMarkGradientId = `marker-dark-room-mark-gradient-${marker.id}`;
  const travelGradientId = `marker-travel-gradient-${marker.id}`;
  const ghostDecoyGradientId = `marker-ghost-decoy-gradient-${marker.id}`;
  const isMutualCruush = marker.relationship?.kind === 'mutual_cruush';
  const isNpcGhostDemo = marker.npcGhostDemo === true;
  const isOwnGhostMarker = isCurrentUser && marker.displayMode === 'GHOST';
  const pingActive = Boolean(marker.activePing);
  const theme = isCurrentUser || isNpcGhostDemo ? 'current' : isMutualCruush ? 'mutual' : 'nearby';
  const markerTheme = HEART_PIN_THEMES[theme];
  const borderColor = marker.travelling === true
    ? MILE_HIGH_SKY_BLUE
    : pingActive
      ? '#C8FF31'
    : isOwnStealthMarker || isOwnGhostMarker || isNpcGhostDemo
      ? '#0BA8FF'
      : markerTheme.border;
  const gradientStops = isOwnStealthMarker
    ? [DARK_ROOM_PALETTE.dark, DARK_ROOM_PALETTE.middle, DARK_ROOM_PALETTE.light]
    : isNpcGhostDemo
    ? HEART_PIN_THEMES.ghost.stops
    : hasPhoto || isCurrentUser
    ? markerTheme.stops
    : getProfileGradientStops(marker.userId ?? marker.id);
  const gradientOffsets = isOwnStealthMarker
    ? ['0%', '50%', '100%']
    : gradientStops.length === 4
      ? ['6%', '53%', '81%', '100%']
      : ['0%', '52%', '100%'];
  const borderPaint = isOwnStealthMarker ? `url(#${gradientId})` : borderColor;
  const borderStyle = { stroke: `var(--cruush-ghost-flash-border-color, ${borderColor})` } as CSSProperties;
  const fillPaint = isOwnGhostMarker
    ? `url(#${ghostDecoyGradientId})`
    : isNpcGhostDemo
      ? '#0BA8FF'
      : `url(#${gradientId})`;
  const travellerActive = marker.travelling === true && !isOwnStealthMarker && !pingActive;
  const staticGhostTraveller = travellerActive && marker.displayMode === 'GHOST';
  const hideOwnerDecoyHeartStroke = staticGhostTraveller && isOwnGhostMarker;
  const ghostDecoyFadeStyle = isOwnGhostMarker
    ? ownerGhostDecoyFadeStyle(marker, isCurrentUser)
    : undefined;

  return (
    <svg
      aria-hidden="true"
      className="relative z-10 h-20 w-20"
      data-testid={`marker-heart-${marker.id}`}
      data-has-photo={hasPhoto ? 'true' : 'false'}
      data-marker-theme={isNpcGhostDemo ? 'npc-ghost-demo' : theme}
      data-pulse-active={pingActive ? 'true' : 'false'}
      data-traveller-active={travellerActive ? 'true' : 'false'}
      data-owner-stealth={isOwnStealthMarker ? 'true' : 'false'}
      data-owner-ghost-decoy={isOwnGhostMarker ? 'true' : 'false'}
      height="80"
      style={ghostDecoyFadeStyle}
      viewBox="0 0 64 64"
      width="80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          data-heart-fill-theme={!isOwnStealthMarker && !isOwnGhostMarker && !isNpcGhostDemo && !pingActive && !travellerActive ? theme : undefined}
          id={gradientId}
          x1="10"
          x2="55"
          y1="9"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          {gradientStops.map((stopColor, index) => (
            <stop key={`${gradientOffsets[index]}-${stopColor}`} offset={gradientOffsets[index]} stopColor={stopColor} />
          ))}
        </linearGradient>
        <clipPath id={clipId}>
          <path d={HEART_PIN_PATH} />
        </clipPath>
        {travellerActive ? (
          <linearGradient id={travelGradientId} x1="8" x2="56" y1="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop data-cruush-brand-stop offset="6%" stopColor="#ff0072" />
            <stop data-cruush-brand-stop offset="53%" stopColor="#6f00ff" />
            <stop data-cruush-brand-stop offset="81%" stopColor="#3826ff" />
            <stop data-cruush-brand-stop offset="100%" stopColor="#1181ff" />
          </linearGradient>
        ) : null}
        {isOwnGhostMarker ? (
          <linearGradient id={ghostDecoyGradientId} x1="32" x2="32" y1="0" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3826FF" />
            <stop offset="14%" stopColor="#004BFF" />
            <stop offset="42%" stopColor="#0BA8FF" />
            <stop offset="100%" stopColor="#0BA8FF" />
          </linearGradient>
        ) : null}
        {isOwnStealthMarker ? (
          <>
            <linearGradient id={stealthMarkGradientId} x1="42" x2="214" y1="4" y2="226" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={DARK_ROOM_PALETTE.dark} />
              <stop offset="50%" stopColor={DARK_ROOM_PALETTE.middle} />
              <stop offset="100%" stopColor={DARK_ROOM_PALETTE.light} />
            </linearGradient>
            <clipPath id={stealthEyeClipId}>
              <g transform="translate(9 6) scale(0.18)">
                <path
                  clipRule="evenodd"
                  d={DARK_ROOM_EYE_PATH}
                  fill="white"
                  fillRule="evenodd"
                />
              </g>
            </clipPath>
            <mask id={stealthKeyholeMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect width="64" height="64" fill="white" />
              <g transform="translate(9 6) scale(0.18)">
                <path d={DARK_ROOM_KEYHOLE_PATH} fill="black" />
              </g>
            </mask>
          </>
        ) : null}
      </defs>
      {isOwnStealthMarker ? (
        <>
          <path
            d={HEART_PIN_PATH}
            data-testid={`marker-ghost-border-${marker.id}`}
            fill={fillPaint}
            fillOpacity={1}
            mask={`url(#${stealthKeyholeMaskId})`}
            stroke={borderPaint}
            strokeWidth={3.2}
          />
          <g data-testid={`marker-dark-room-keyhole-${marker.id}`} transform="translate(9 6) scale(0.18)">
            <DarkRoomKeyholeEyeGraphic
              eyeFill={`url(#${stealthMarkGradientId})`}
            />
          </g>
          {darkRoomPhoto ? (
            <image
              className="cruush-ghost-rotation-heart-photo"
              clipPath={`url(#${stealthEyeClipId})`}
              data-dark-room-part="eye"
              data-testid={`marker-dark-room-photo-${marker.id}`}
              height="64"
              href={darkRoomPhoto}
              preserveAspectRatio="xMidYMid slice"
              width="64"
            />
          ) : null}
        </>
      ) : hasPhoto ? (
        <>
          <image
            className="cruush-ghost-rotation-heart-photo"
            clipPath={`url(#${clipId})`}
            data-testid={`marker-photo-fill-${marker.id}`}
            height="64"
            href={resolvedPhoto}
            preserveAspectRatio="xMidYMid slice"
            style={isOwnGhostMarker ? ({ '--cruush-ghost-photo-opacity': 0.62 } as CSSProperties) : undefined}
            width="64"
          />
          <path
            d={HEART_PIN_PATH}
            data-testid={`marker-ghost-border-${marker.id}`}
            fill="none"
            stroke={borderPaint}
            strokeOpacity={hideOwnerDecoyHeartStroke ? 0 : 1}
            strokeWidth={3.2}
            style={borderStyle}
          />
        </>
      ) : isCurrentUser && !isMutualCruush ? (
        <>
          <path
            d={HEART_PIN_PATH}
            data-testid={`marker-ghost-border-${marker.id}`}
            fill={fillPaint}
            fillOpacity={1}
            stroke={borderPaint}
            strokeOpacity={hideOwnerDecoyHeartStroke ? 0 : 1}
            strokeWidth={3.2}
            style={borderStyle}
          />
          <foreignObject data-testid={`marker-current-fallback-${marker.id}`} height="36" width="36" x="14" y="16">
            <div className="flex h-9 w-9 items-center justify-center">
              <User aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={2.4} />
            </div>
          </foreignObject>
        </>
      ) : (
        <path
          d={HEART_PIN_PATH}
          data-testid={`marker-ghost-border-${marker.id}`}
          fill={fillPaint}
          fillOpacity={1}
          stroke={borderPaint}
          strokeOpacity={hideOwnerDecoyHeartStroke ? 0 : 1}
          strokeWidth={3.2}
          style={borderStyle}
        />
      )}
      {travellerActive ? (
        <MileHighContrail
          forceReducedMotion={staticGhostTraveller}
          gradientId={travelGradientId}
          marker={marker}
        />
      ) : null}
      {pingActive && !travellerActive ? <PulseEkgHeartTrace clipId={clipId} /> : null}
    </svg>
  );
}

function VenueClusterMarker({ marker }: { marker: MapMarker }) {
  const count = marker.cluster?.count ?? 0;

  return (
    <span
      className="relative left-8 top-6 flex h-12 w-12 rotate-45 items-center justify-center rounded-[0.7rem] border-2 border-[#55C8FF] bg-black/94 text-white shadow-[0_0_10px_rgba(20,157,255,0.95),0_0_24px_rgba(21,79,255,0.62)] backdrop-blur-md"
      data-testid={`venue-cluster-marker-${marker.cluster?.id ?? marker.id}`}
    >
      <span className="cruush-logo-font flex -rotate-45 items-center text-xl font-normal leading-none tracking-normal">
        {count > 999 ? '999+' : count}
      </span>
    </span>
  );
}

function PeopleClusterMarker({ marker }: { marker: MapMarker }) {
  const count = marker.cluster?.count ?? 0;

  return (
    <span
      className="cruush-logo-font flex h-16 min-w-16 items-center justify-center rounded-full border border-[3.2px] border-[#FF0072]/70 bg-black/86 px-4 text-2xl font-normal leading-none tracking-normal text-white shadow-[0_0_46px_rgba(255,0,114,0.72)] backdrop-blur-md"
      data-testid={`people-cluster-marker-${marker.cluster?.id ?? marker.id}`}
    >
      {count > 999 ? '999+' : count}
    </span>
  );
}

const PLACE_MARKER_CONFIG: Record<string, { icon?: LucideIcon; special?: 'stairs' | 'beach' | 'adult' }> = {
  clinic: { icon: Cross },
  bar: { icon: Martini },
  nightclub: { icon: Music2 },
  community_space: { icon: HeartHandshake },
  park: { icon: Trees },
  restroom: { icon: Toilet },
  sauna: { icon: Waves },
  gym: { icon: Dumbbell },
  hotel: { icon: BedDouble },
  dungeon: { icon: KeyRound },
  venue: { icon: MapPinned },
  cafe: { icon: Coffee },
  shop: { icon: ShoppingBag },
  library: { icon: BookOpen },
  staircase: { special: 'stairs' },
  trail: { icon: Route },
  transit: { icon: TrainFront },
  parking: { icon: CircleParking },
  beach: { special: 'beach' },
  adult_venue: { special: 'adult' },
  other: { icon: Shapes },
};

function PlaceMarker({ marker, previewed = false }: { marker: MapMarker; previewed?: boolean }) {
  const active = (marker.place?.activeCheckins ?? 0) > 0;
  const facilityType = marker.place?.facilityType ?? 'other';
  const config = PLACE_MARKER_CONFIG[facilityType] ?? PLACE_MARKER_CONFIG.other;
  const Icon = config.icon ?? Shapes;
  return (
    <span
      className="group relative flex h-12 w-12 items-center justify-center"
      data-facility-type={facilityType}
      data-testid={`place-marker-${marker.place?.id ?? marker.id}`}
    >
      <span
        className={`pointer-events-none absolute bottom-[calc(100%+0.75rem)] left-1/2 z-20 w-max max-w-[14rem] -translate-x-1/2 rounded-full border border-white/15 bg-black/92 px-3 py-1 text-center text-xs font-semibold leading-tight text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-opacity duration-150 ${previewed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
        data-testid={`place-marker-title-${marker.place?.id ?? marker.id}`}
      >
        {marker.displayName}
      </span>
      <span className={`relative flex h-12 w-12 rotate-45 items-center justify-center rounded-[0.7rem] border-2 bg-black/94 text-white shadow-[0_0_10px_rgba(20,157,255,0.95),0_0_24px_rgba(21,79,255,0.62)] backdrop-blur-md ${active ? 'border-[#C8FF31] shadow-[0_0_28px_rgba(200,255,49,0.55)]' : 'border-[#55C8FF]'}`}>
        <span className="flex h-8 w-8 -rotate-45 items-center justify-center">
          {config.special === 'beach' ? <img src={beachUmbrellaIcon} alt="" className="h-7 w-7 brightness-0 invert" /> : null}
          {config.special === 'stairs' ? <span aria-hidden="true" className="relative block h-6 w-6"><i className="absolute bottom-1 left-0 h-[3px] w-2.5 rounded-full bg-white" /><i className="absolute bottom-2.5 left-[7px] h-[3px] w-2.5 rounded-full bg-white" /><i className="absolute bottom-4 left-3.5 h-[3px] w-2.5 rounded-full bg-white" /></span> : null}
          {config.special === 'adult' ? <span className="cruush-logo-font text-[21px] font-normal leading-none tracking-normal">18+</span> : null}
          {!config.special ? <Icon className="h-6 w-6" /> : null}
        </span>
        {active ? <span className="absolute -right-2 -top-2 flex h-6 min-w-6 -rotate-45 items-center justify-center rounded-full bg-[#C8FF31] px-1 text-[10px] font-bold text-black">{marker.place?.activeCheckins}</span> : null}
      </span>
    </span>
  );
}

function LaunchPartyMarker({ marker }: { marker: MapMarker }) {
  const attendeeCount = marker.event?.attendeeCount ?? 0;

  return (
    <span
      className="flex h-16 min-w-16 items-center justify-center rounded-full border border-[3.2px] border-[#FF0072]/45 bg-black/82 px-4 text-xl font-semibold text-white shadow-[0_0_38px_rgba(255,0,114,0.55)] backdrop-blur-md"
      data-testid={`launch-party-marker-${marker.id}`}
    >
      {attendeeCount > 999 ? '999+' : attendeeCount}
    </span>
  );
}

export // A Pulse draws an EKG inside the heart and through its caption on the same beat.
// Both sit light so a face still reads through them.
const PULSE_EKG_PIN_PATH = 'M8 32h9q1.5 -2.5 3 0h2l2 5 3 -20 3 25 2 -10q3 -7 6 0h18';
const PULSE_EKG_SIGNAL_PATH = 'M0 6h7q1 -1.6 2 0h1.4l0.8 2 1.2 -5.4 1.2 6.6 0.8 -2q2 -1.8 4 0h23.6';

function PulseEkgHeartTrace({ clipId }: { clipId: string }) {
  return (
    <g clipPath={`url(#${clipId})`} data-testid="pulse-ekg-pin" fill="none">
      <path
        className="cruush-pulse-ekg-draw"
        d={PULSE_EKG_PIN_PATH}
        stroke="#C8FF31"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.5"
        strokeWidth="3.4"
        style={{ filter: 'blur(1.6px)' }}
      />
      <path
        className="cruush-pulse-ekg-draw"
        d={PULSE_EKG_PIN_PATH}
        stroke="#EDFFB4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.85"
        strokeWidth="1.2"
      />
    </g>
  );
}

function PulseEkgSignalTrace() {

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-testid="pulse-ekg-signal"
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 42 12"
    >
      <path
        className="cruush-pulse-ekg-draw"
        d={PULSE_EKG_SIGNAL_PATH}
        stroke="#C8FF31"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.5"
        strokeWidth="0.9"
      />
    </svg>
  );
}

export function MapMarkerPin({ marker, previewed = false }: { marker: MapMarker; previewed?: boolean }) {
  const isCurrentUser = marker.isCurrentUser === true;
  const isOwnerGhostDecoy = isCurrentUser && marker.displayMode === 'GHOST';
  const isPerson = marker.kind == null || marker.kind === 'person';
  const signalPreview = isPerson ? truncateMarkerPreview(marker.signal) : '';
  const postPreview = isPerson ? truncateMarkerPreview(marker.latestFeedPostPreview) : '';
  const pingActive = Boolean(marker.activePing);
  const travellerActive = marker.travelling === true
    && !(isCurrentUser && marker.ownerStealthActive === true)
    && !pingActive;
  // The signal capsule wears the same border as the unit it belongs to, so the
  // pin and its caption read as one object.
  const signalBorderColor = getMarkerBorderColor(marker, isCurrentUser);

  if (marker.kind === 'cluster') {
    return isPersonCluster(marker) ? <PeopleClusterMarker marker={marker} /> : <VenueClusterMarker marker={marker} />;
  }

  if (marker.kind === 'place') {
    return <PlaceMarker marker={marker} previewed={previewed} />;
  }

  if (marker.kind === 'event') {
    return <LaunchPartyMarker marker={marker} />;
  }

  return (
    <span
      className="group pointer-events-auto relative flex h-[88px] w-[103px] origin-bottom scale-100 items-start justify-center overflow-visible"
      data-testid={`marker-pin-unit-${marker.id}`}
      data-active-ping={pingActive ? 'true' : 'false'}
    >
      <span
        className={`cruush-ghost-rotation-unit-material relative flex h-20 w-[103px] origin-bottom items-center justify-center transition-transform duration-150 group-hover:scale-[1.38] group-focus-within:scale-[1.38] ${previewed ? 'scale-[1.38]' : ''} ${pingActive && !travellerActive ? 'cruush-map-ping-heart' : ''}`}
        data-testid={`marker-heart-layer-${marker.id}`}
      >
        <GhostRotationPulse marker={marker}>
          {(exitActive, exitStyle) => <>
            <span className={exitActive ? 'cruush-ghost-rotation-heart-exit' : ''} style={exitStyle}>
              <MarkerHeart marker={marker} isCurrentUser={isCurrentUser} />
              <MarkerSideBadge badge={marker.roleBadge} marker={marker} isCurrentUser={isCurrentUser} side="left" />
              <MarkerSideBadge badge={marker.badge} marker={marker} isCurrentUser={isCurrentUser} side="right" />
            </span>
            {(signalPreview || isOwnerGhostDecoy) && !exitActive ? (
              <span
                className={`absolute left-1/2 top-0 z-30 flex w-max max-w-[16rem] -translate-x-1/2 -translate-y-full flex-col items-center gap-1 transition-opacity duration-150 ${pingActive || previewed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                data-signal-position="v2-frame-top"
                data-testid={`marker-signal-stack-${marker.id}`}
              >
                <span
                  className={`relative overflow-hidden rounded-full border border-[3.2px] bg-black/86 px-3 py-1 text-center text-[0.7rem] font-semibold leading-tight text-white backdrop-blur-md ${getMileHighRingClass(marker)}`}
                  data-testid={`marker-signal-badge-${marker.id}`}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, var(--cruush-ghost-surface-alpha, 0.86))',
                    borderColor: `var(--cruush-ghost-flash-border-color, ${signalBorderColor})`,
                    borderWidth: '3.2px',
                  } as CSSProperties}
                >
                  {pingActive ? <PulseEkgSignalTrace /> : null}
                  <span className="cruush-ghost-rotation-signal-symbol relative">
                    {isOwnerGhostDecoy
                      ? <GhostRotationCountdown expiresAtMs={marker.ghostRotationExpiresAtMs} />
                      : signalPreview}
                  </span>
                </span>
              </span>
            ) : null}
          </>}
        </GhostRotationPulse>
      </span>
      {postPreview ? (
        <span
          className={`absolute left-1/2 top-0 z-20 w-max max-w-[16rem] -translate-x-1/2 transition-opacity duration-150 ${previewed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'} ${signalPreview ? '-translate-y-[calc(200%+0.25rem)]' : '-translate-y-full'}`}
          data-testid={`marker-post-preview-${marker.id}`}
        >
          <span className="rounded-full border border-primary/20 bg-black/86 px-3 py-1 text-center text-[0.7rem] font-semibold leading-tight text-primary backdrop-blur-md">
            {postPreview}
          </span>
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
  marker: MapMarker,
  onPinClick: (marker: MapMarker) => void,
  onPinPreview: (marker: MapMarker) => void,
  onMarkerInteraction: () => void,
) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser;
  const isInteractive = true;
  const element = document.createElement(isInteractive ? 'button' : 'div');
  const name = getDisplayName(marker);

  const animationHint = marker.animationHint ?? 'NONE';

  // The box is tall enough to hold the exit Ghost without clipping it. The last
  // minute is not dimmed: the pin announces itself by flashing, and dimming it
  // as well made every ghost profile look like it had already left.
  element.className = [
    'group relative flex h-[128px] w-[103px] items-start justify-center overflow-visible border-0 bg-transparent p-0 transition-opacity duration-700',
    animationHint === 'SIGNAL_LOSS' ? 'opacity-15 animate-pulse' : '',
    animationHint === 'REAPPEAR' ? 'opacity-100' : '',
  ].filter(Boolean).join(' ');
  // Only markers that actually carry a hint get tagged, so a ghost pin with no
  // rotation data stays exactly as static as it was before the countdown.
  if (marker.animationHint) {
    element.dataset.animationHint = marker.animationHint;
  }
  element.dataset.displayMode = marker.displayMode ?? 'PRECISE';
  element.dataset.mapMarkerPin = 'true';
  element.dataset.mapMarkerKind = marker.kind ?? 'person';
  element.dataset.activePing = marker.activePing ? 'true' : 'false';
  const root = createRoot(element);
  const hasSignalPreview = Boolean(truncateMarkerPreview(marker.signal))
    || (isCurrentUser && marker.displayMode === 'GHOST');
  const supportsHoldPreview = marker.kind == null || marker.kind === 'person' || marker.kind === 'place';
  let previewed = false;
  let restingZIndex: string | null = null;
  let lastPointerType = '';
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let touchStartPoint: { x: number; y: number } | null = null;
  const clearLongPressTimer = () => {
    if (longPressTimer != null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  const renderMarker = () => {
    flushSync(() => {
      root.render(<MapMarkerPin marker={marker} previewed={previewed} />);
    });
  };
  const setPreviewed = (nextPreviewed: boolean) => {
    if (previewed === nextPreviewed) {
      return;
    }

    previewed = nextPreviewed;
    element.dataset.markerPreviewed = nextPreviewed ? 'true' : 'false';
    if (hasSignalPreview) {
      if (nextPreviewed) {
        restingZIndex = element.style.zIndex;
        element.style.zIndex = String(SIGNAL_PREVIEW_MARKER_Z_INDEX);
      } else if (restingZIndex != null) {
        element.style.zIndex = restingZIndex;
        restingZIndex = null;
      }
    }
    if (element instanceof HTMLButtonElement && supportsHoldPreview) {
      element.setAttribute('aria-pressed', nextPreviewed ? 'true' : 'false');
    }
    renderMarker();
  };

  if (!isInteractive) {
    element.setAttribute('aria-label', 'Your approximate area');
    element.setAttribute('role', 'img');
  } else {
    const button = element as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-label', isCurrentUser
      ? marker.displayMode === 'GHOST'
        ? 'Show your Ghost Mode decoy details'
        : 'Show your pin details'
      : marker.kind === 'event'
      ? `Open ${marker.event?.venueName ?? name} launch party on map`
      : marker.kind === 'cluster'
      ? isSpiderfyCluster(marker)
        ? `Open ${marker.cluster?.label ?? name} sharing this map spot`
        : isPersonCluster(marker)
        ? `Zoom into ${marker.cluster?.label ?? name} on map`
        : `Open ${marker.cluster?.label ?? name} on map`
      : marker.kind === 'place'
        ? `Open ${name} spot board`
      : `Open ${name} on map`);
    if (supportsHoldPreview) {
      button.setAttribute('aria-pressed', 'false');
      button.title = isCurrentUser
        ? 'Tap or hover for details'
        : marker.kind === 'place'
        ? 'Click to open spot board; hover or hold for name'
        : 'Tap to open profile; hover for details';
    }
    const recordMarkerInteraction = (event: Event) => {
      event.stopPropagation();
      onMarkerInteraction();
    };

    // Preview on pointer enter for every pointer type. The hover media query is
    // false under a coarse pointer, and device emulation reports a mouse as a
    // touch pointer, so gating on either left the preview dead on mobile.
    button.addEventListener('pointerenter', (event) => {
      if (document.documentElement.dataset.cruushMapControlsHovered === 'true') {
        setPreviewed(false);
        return;
      }
      const pointerEvent = event as PointerEvent;
      if (marker.kind !== 'place' || pointerEvent.pointerType !== 'touch') {
        onPinPreview(marker);
      }
    });
    button.addEventListener('pointerleave', (event) => {
      if ((event as PointerEvent).pointerType !== 'touch') {
        setPreviewed(false);
      }
    });

    button.addEventListener('pointerdown', (event) => {
      if (document.documentElement.dataset.cruushMapControlsHovered === 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPreviewed(false);
        return;
      }
      const pointerEvent = event as PointerEvent;
      lastPointerType = pointerEvent.pointerType || '';
      recordMarkerInteraction(event);
      if (supportsHoldPreview && lastPointerType === 'touch') {
        clearLongPressTimer();
        longPressTriggered = false;
        touchStartPoint = { x: pointerEvent.clientX, y: pointerEvent.clientY };
        longPressTimer = window.setTimeout(() => {
          longPressTimer = null;
          longPressTriggered = true;
          onPinPreview(marker);
        }, MOBILE_MARKER_LONG_PRESS_MS);
      }
    });
    button.addEventListener('pointermove', (event) => {
      if (!touchStartPoint || longPressTimer == null) {
        return;
      }

      const pointerEvent = event as PointerEvent;
      const movedX = Math.abs(pointerEvent.clientX - touchStartPoint.x);
      const movedY = Math.abs(pointerEvent.clientY - touchStartPoint.y);
      if (movedX > MOBILE_MARKER_LONG_PRESS_MOVE_TOLERANCE_PX || movedY > MOBILE_MARKER_LONG_PRESS_MOVE_TOLERANCE_PX) {
        clearLongPressTimer();
      }
    });
    if (supportsHoldPreview) {
      button.addEventListener('focus', () => onPinPreview(marker));
      button.addEventListener('blur', () => setPreviewed(false));
    }
    const finishPointerInteraction = () => {
      clearLongPressTimer();
      touchStartPoint = null;
    };
    button.addEventListener('pointerup', finishPointerInteraction);
    button.addEventListener('pointercancel', finishPointerInteraction);
    button.addEventListener('contextmenu', (event) => {
      if (lastPointerType === 'touch' && longPressTriggered) {
        event.preventDefault();
      }
    });
    button.addEventListener('mousedown', recordMarkerInteraction);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onMarkerInteraction();
      if (isCurrentUser) {
        if (lastPointerType === 'touch') {
          if (previewed) {
            setPreviewed(false);
          } else {
            onPinPreview(marker);
          }
        } else {
          onPinPreview(marker);
        }
        return;
      }
      if (supportsHoldPreview && lastPointerType === 'touch' && event.detail > 0) {
        if (longPressTriggered) {
          longPressTriggered = false;
          return;
        }
        onPinClick(marker);
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

  if (marker.kind == null || marker.kind === 'person') {
    // Map and navigation controls sit over the map, and some of their wrappers
    // let the pointer through. Reaching a control is not reaching the pin
    // underneath it, so a preview only opens while the pin is what the pointer
    // is actually on top of.
    const pointerIsOnThisPin = (pointerEvent: PointerEvent) => {
      const topmost = typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        : pointerEvent.target;

      return topmost instanceof Node && element.contains(topmost);
    };

    element.addEventListener('pointerenter', (event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch' && pointerIsOnThisPin(pointerEvent)) {
        onPinPreview(marker);
      }
    });
    element.addEventListener('pointermove', (event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType === 'touch') {
        return;
      }

      if (pointerIsOnThisPin(pointerEvent)) {
        onPinPreview(marker);
      } else {
        setPreviewed(false);
      }
    });
    element.addEventListener('pointerleave', (event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') {
        setPreviewed(false);
      }
    });
  }

  renderMarker();

  return {
    element,
    root,
    setPreviewed,
    dispose: clearLongPressTimer,
  };
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

function createGhostLeashFeature(leash: GhostLeash) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: [
        [leash.from.approximateLongitude, leash.from.approximateLatitude],
        [leash.to.approximateLongitude, leash.to.approximateLatitude],
      ],
    },
  };
}

export function ghostLeashCameraPadding(containerWidth: number) {
  return containerWidth < 640
    ? { top: 180, right: 220, bottom: 190, left: 88 }
    : { top: 120, right: 160, bottom: 140, left: 120 };
}

function cleanupRenderedMarker({ dispose, marker, root }: RenderedMapMarker) {
  dispose();
  marker.remove();
  queueMicrotask(() => root.unmount());
}

function MapView({
  onPinClick,
  onMapClick,
  onMapReady,
  markers,
  peopleHeatmapEnabled = false,
  fitToMarkers = false,
  focusCoordinates,
  initialViewport,
  radiusCircle,
  browseArea,
  ghostLeash,
  demoRadiusCircles = [],
  denseVenue = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<RenderedMapMarker[]>([]);
  const viewportMarkersRef = useRef<MapMarker[]>([]);
  const demoRadiusCirclesRef = useRef<RadiusCircle[]>([]);
  const mapLibreRef = useRef<MapLibreExport | null>(null);
  const initialViewportRef = useRef(initialViewport);
  const browseAreaRef = useRef(browseArea);
  const autoFitFocusKeyRef = useRef<string | null>(null);
  const hasAppliedAutoFitRef = useRef(false);
  const directFocusRef = useRef<{ map: MapLibreMap; key: string } | null>(null);
  const ghostLeashFocusKeyRef = useRef<string | null>(null);
  const mapLabelTextSizesRef = useRef<{
    map: MapLibreMap | null;
    sizes: Map<string, ReturnType<MapLibreMap['getLayoutProperty']>>;
  }>({ map: null, sizes: new Map() });
  const onPinClickRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);
  const onMapReadyRef = useRef(onMapReady);
  const lastMarkerInteractionAtRef = useRef(0);
  browseAreaRef.current = browseArea;
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [mapLoadStatus, setMapLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapError, setMapError] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [largerMapText, setLargerMapText] = useState(
    () => getAccessibilityPreferences().largerText,
  );
  const [spiderfiedCluster, setSpiderfiedCluster] = useState<SpiderfiedCluster | null>(null);
  const mapStyle = useMemo(() => getMapStyle(), []);
  const denseMarkerResult = useMemo(
    () => applyDenseVenueMarkers(markers, denseVenue, currentZoom),
    [currentZoom, denseVenue, markers],
  );
  const focusLatitude = focusCoordinates?.approximateLatitude ?? null;
  const focusLongitude = focusCoordinates?.approximateLongitude ?? null;
  const renderedMarkers = useMemo(
    () => {
      const clusteredMarkers = applyPersonMarkerClusters(
        denseMarkerResult.markers,
        currentZoom,
        focusCoordinates,
        spiderfiedCluster,
      );
      // Clustering can collapse nearby members, but individual member
      // coordinates stay exactly where the API placed them at every zoom.
      const withPlaceClusters = applyPlaceMarkerClusters(clusteredMarkers, currentZoom);
      return separateOverlappingMarkers(withPlaceClusters, currentZoom);
    },
    [currentZoom, denseMarkerResult.markers, focusCoordinates, spiderfiedCluster],
  );
  const renderedMarkerSignature = useMemo(() => JSON.stringify(renderedMarkers), [renderedMarkers]);
  const heatmapData = useMemo(() => createUserHeatmapFeatureCollection(markers), [markers]);
  const heatmapFeatureSignature = useMemo(() => heatmapData.features.map((feature) => (
    `${feature.geometry.coordinates.join(':')}:${feature.properties.samples}:${feature.properties.weight}`
  )).join('|'), [heatmapData]);
  const renderedMarkersRef = useRef(renderedMarkers);
  renderedMarkersRef.current = renderedMarkers;
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

  useEffect(() => addAccessibilityPreferencesChangedListener((preferences) => {
    setLargerMapText(preferences.largerText);
  }), []);

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

      const startMap = (style: ReturnType<typeof getMapStyle>) => {
        if (!isMounted || !containerRef.current) {
          return;
        }

        let didLoad = false;
        let failedBeforeLoad = false;
        let renderReadyTimeout: ReturnType<typeof window.setTimeout> | null = null;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: initialViewportRef.current
            ? [initialViewportRef.current.center.approximateLongitude, initialViewportRef.current.center.approximateLatitude]
            : DEFAULT_CENTER,
          zoom: initialViewportRef.current?.zoom ?? DEFAULT_ZOOM,
          minZoom: mapServiceMinZoomForViewport(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
            MIN_DISCOVERY_ZOOM,
          ),
          maxZoom: MAX_DISCOVERY_ZOOM,
          maxBounds: MAP_SERVICE_MAX_BOUNDS,
          renderWorldCopies: false,
          attributionControl: false,
        });
        mapRef.current = map;
        setMapInstance(map);

        const clearRenderReadyTimeout = () => {
          if (renderReadyTimeout == null) {
            return;
          }

          window.clearTimeout(renderReadyTimeout);
          renderReadyTimeout = null;
        };

        const markMapReady = () => {
          if (!isMounted || mapRef.current !== map) {
            return;
          }

          didLoad = true;
          failedBeforeLoad = false;
          clearRenderReadyTimeout();
          setMapLoadStatus('ready');
          setMapError(null);
        };

        const scheduleRenderedReady = () => {
          if (didLoad || failedBeforeLoad || renderReadyTimeout != null) {
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

        const handleMapStyleLoad = () => {
          if (!isMounted || mapRef.current !== map) {
            return;
          }

          addMapServiceOutsideMask(map);
          syncMapBrowseOutsideMask(map, browseAreaRef.current);
        };

        const handleMapLoad = () => {
          handleMapStyleLoad();
          markMapReady();
        };

        map.on('click', (event) => {
          const markerInteractionWasRecent = Date.now() - lastMarkerInteractionAtRef.current < MARKER_INTERACTION_SUPPRESS_MS;

          if (markerInteractionWasRecent || isMapClickFromMarker(event)) {
            return;
          }

          markersRef.current.forEach((renderedMarker) => renderedMarker.setPreviewed(false));
          onMapClickRef.current?.();
        });
        map.on('zoomend', () => {
          if (typeof map.getZoom === 'function') {
            setCurrentZoom(map.getZoom());
          }
        });
        map.on('style.load', handleMapStyleLoad);
        map.on('load', handleMapLoad);
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

          failedBeforeLoad = true;
          clearRenderReadyTimeout();
          setMapLoadStatus('error');
          setMapError(MAP_ERROR_MESSAGE);
        });
        onMapReadyRef.current?.(map);
      };

      try {
        startMap(mapStyle);
      } catch (error) {
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
  }, [mapStyle]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!hasActiveMapStyle(map) || mapLoadStatus !== 'ready') {
      return;
    }

    if (
      typeof map.getStyle !== 'function'
      || typeof map.getLayoutProperty !== 'function'
      || typeof map.setLayoutProperty !== 'function'
    ) {
      return;
    }

    if (mapLabelTextSizesRef.current.map !== map) {
      mapLabelTextSizesRef.current = { map, sizes: new Map() };
    }

    const { sizes } = mapLabelTextSizesRef.current;
    for (const layer of map.getStyle()?.layers ?? []) {
      if (layer.type !== 'symbol') {
        continue;
      }

      const textField = map.getLayoutProperty(layer.id, 'text-field');
      const currentTextSize = map.getLayoutProperty(layer.id, 'text-size');
      if (textField == null || currentTextSize == null) {
        continue;
      }

      if (!sizes.has(layer.id)) {
        sizes.set(layer.id, currentTextSize);
      }

      const baseTextSize = sizes.get(layer.id);
      map.setLayoutProperty(
        layer.id,
        'text-size',
        largerMapText ? ['*', baseTextSize, MAP_ACCESSIBILITY_TEXT_SCALE] : baseTextSize,
      );
    }
  }, [largerMapText, mapInstance, mapLoadStatus]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!hasActiveMapStyle(map) || mapLoadStatus !== 'ready') {
      return;
    }

    syncMapBrowseOutsideMask(map, browseArea);
  }, [
    browseArea?.center.approximateLatitude,
    browseArea?.center.approximateLongitude,
    browseArea?.radiusMiles,
    mapInstance,
    mapLoadStatus,
  ]);

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

      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];
      const padding = { top: 140, right: 120, bottom: 170, left: 120 };
      if (typeof map.cameraForBounds === 'function' && typeof map.easeTo === 'function') {
        const camera = map.cameraForBounds(bounds, { padding, maxZoom: AUTO_FIT_MAX_ZOOM });
        map.easeTo({
          ...camera,
          zoom: Math.max(camera.zoom ?? AUTO_FIT_MIN_ZOOM, AUTO_FIT_MIN_ZOOM),
          duration: 500,
        });
      } else {
        map.fitBounds(bounds, { padding, maxZoom: AUTO_FIT_MAX_ZOOM, duration: 500 });
      }
      hasAppliedAutoFitRef.current = true;
      return;
    }

    map.setCenter([focusLongitude, focusLatitude]);
    map.setZoom(FOCUSED_ZOOM);
    directFocusRef.current = { map, key: focusKey };
  }, [fitToMarkers, focusLatitude, focusLongitude, mapInstance, viewportMarkerSignature]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!hasActiveMapStyle(map) || mapLoadStatus !== 'ready') {
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
      moveMapServiceOutsideMaskToTop(map);
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
    moveMapServiceOutsideMaskToTop(map);
  }, [mapInstance, mapLoadStatus, radiusCircle]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!hasActiveMapStyle(map) || mapLoadStatus !== 'ready') {
      return;
    }

    const sourceId = 'owner-ghost-leash';
    const layerId = 'owner-ghost-leash-line';
    const getLayer = typeof map.getLayer === 'function' ? map.getLayer.bind(map) : () => undefined;
    const getSource = typeof map.getSource === 'function' ? map.getSource.bind(map) : () => undefined;
    const removeLayer = typeof map.removeLayer === 'function' ? map.removeLayer.bind(map) : null;
    const removeSource = typeof map.removeSource === 'function' ? map.removeSource.bind(map) : null;

    if (!ghostLeash) {
      ghostLeashFocusKeyRef.current = null;
      if (getLayer(layerId) && removeLayer) {
        removeLayer(layerId);
      }
      if (getSource(sourceId) && removeSource) {
        removeSource(sourceId);
      }
      return;
    }

    const data = createGhostLeashFeature(ghostLeash);
    const ghostLeashFocusKey = [
      ghostLeash.from.approximateLatitude,
      ghostLeash.from.approximateLongitude,
      ghostLeash.to.approximateLatitude,
      ghostLeash.to.approximateLongitude,
    ].map((value) => value.toFixed(6)).join(':');

    if (ghostLeashFocusKeyRef.current !== ghostLeashFocusKey) {
      ghostLeashFocusKeyRef.current = ghostLeashFocusKey;
      map.fitBounds(
        [
          [
            Math.min(ghostLeash.from.approximateLongitude, ghostLeash.to.approximateLongitude),
            Math.min(ghostLeash.from.approximateLatitude, ghostLeash.to.approximateLatitude),
          ],
          [
            Math.max(ghostLeash.from.approximateLongitude, ghostLeash.to.approximateLongitude),
            Math.max(ghostLeash.from.approximateLatitude, ghostLeash.to.approximateLatitude),
          ],
        ],
        {
          padding: ghostLeashCameraPadding(map.getContainer().clientWidth),
          maxZoom: FOCUSED_ZOOM,
          duration: 500,
        },
      );
    }
    const existingSource = getSource(sourceId) as GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(data);
      moveMapServiceOutsideMaskToTop(map);
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
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#0BA8FF',
        'line-opacity': 0.9,
        'line-width': 2.5,
        'line-dasharray': [2, 1.5],
      },
    });
    moveMapServiceOutsideMaskToTop(map);
  }, [ghostLeash, mapInstance, mapLoadStatus, renderedMarkerSignature]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!hasActiveMapStyle(map) || mapLoadStatus !== 'ready') {
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
      moveMapServiceOutsideMaskToTop(map);
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
    moveMapServiceOutsideMaskToTop(map);
  }, [demoRadiusCircleSignature, mapInstance, mapLoadStatus]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!hasActiveMapStyle(map) || mapLoadStatus !== 'ready') return;
    const getLayer = typeof map.getLayer === 'function' ? map.getLayer.bind(map) : () => undefined;
    const getSource = typeof map.getSource === 'function' ? map.getSource.bind(map) : () => undefined;
    const removeLayer = typeof map.removeLayer === 'function' ? map.removeLayer.bind(map) : null;
    const removeSource = typeof map.removeSource === 'function' ? map.removeSource.bind(map) : null;

    if (!peopleHeatmapEnabled || heatmapData.features.length === 0) {
      if (getLayer(USER_HEATMAP_LAYER_ID) && removeLayer) removeLayer(USER_HEATMAP_LAYER_ID);
      if (getSource(USER_HEATMAP_SOURCE_ID) && removeSource) removeSource(USER_HEATMAP_SOURCE_ID);
      return;
    }

    const existingSource = getSource(USER_HEATMAP_SOURCE_ID) as GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(heatmapData);
      return;
    }
    if (typeof map.addSource !== 'function' || typeof map.addLayer !== 'function') return;
    map.addSource(USER_HEATMAP_SOURCE_ID, { type: 'geojson', data: heatmapData });
    const layer = {
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
    if (beforeId) map.addLayer(layer, beforeId); else map.addLayer(layer);
  }, [heatmapFeatureSignature, heatmapData, mapInstance, mapLoadStatus, peopleHeatmapEnabled]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    const maplibregl = mapLibreRef.current;

    if (!hasActiveMapStyle(map) || !maplibregl) {
      return;
    }

    markersRef.current.forEach(cleanupRenderedMarker);
    markersRef.current = [];

    const visibleMarkers = renderedMarkersRef.current.filter(isMapMarker);
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      markersRef.current = visibleMarkers.map((marker) => {
        const { dispose, element, root, setPreviewed } = createMarkerElement(
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

            if (isPersonCluster(selectedMarker) || isPlaceCluster(selectedMarker)) {
              const memberIds = selectedMarker.cluster?.memberIds ?? [];
              const memberMarkers = denseMarkerResult.markers.filter((candidate) => memberIds.includes(candidate.id));
              const clusterMaxZoom = isPlaceCluster(selectedMarker) ? PLACE_CLUSTER_MAX_ZOOM : PERSON_CLUSTER_MAX_ZOOM;
              const coordinates = memberMarkers.map((candidate) => [
                candidate.approximateLongitude,
                candidate.approximateLatitude,
              ] as [number, number]);
              if (coordinates.length > 1 && typeof map.fitBounds === 'function') {
                const lngs = coordinates.map(([lng]) => lng);
                const lats = coordinates.map(([, lat]) => lat);
                setSpiderfiedCluster(null);
                map.fitBounds(
                  [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                  { padding: { top: 180, right: 140, bottom: 220, left: 140 }, maxZoom: clusterMaxZoom, duration: 450 },
                );
                return;
              }
              const nextZoom = Math.min(
                clusterMaxZoom + 0.75,
                Math.max(currentZoom + PERSON_CLUSTER_ZOOM_STEP, clusterMaxZoom + 0.25),
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
          (previewedMarker) => {
            markersRef.current.forEach((renderedMarker) => {
              renderedMarker.setPreviewed(renderedMarker.id === previewedMarker.id);
            });
          },
          () => {
            lastMarkerInteractionAtRef.current = Date.now();
          },
        );
        const displayMarker = marker as DisplayMapMarker;

        if (marker.activePing) {
          element.style.zIndex = String(ACTIVE_PING_MARKER_Z_INDEX);
        } else if (displayMarker.spiderfy) {
          element.dataset.spiderfyIndex = String(displayMarker.spiderfy.index);
          element.dataset.spiderfyCount = String(displayMarker.spiderfy.count);
          element.style.zIndex = String(30 + displayMarker.spiderfy.index);
        }

        const mapMarker = new maplibregl.Marker({
          element,
          ...(displayMarker.spiderfy ? { offset: displayMarker.spiderfy.offset } : {}),
        })
          .setLngLat([marker.approximateLongitude, marker.approximateLatitude])
          .addTo(map);
        return {
          dispose,
          id: marker.id,
          marker: mapMarker,
          root,
          setPreviewed,
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [currentZoom, mapInstance, renderedMarkerSignature]);

  return (
    <div className="relative h-full min-h-[400px] w-full overflow-hidden bg-background">
      <div
        ref={containerRef}
        className="cruush-map h-full min-h-[400px] w-full overflow-hidden bg-background"
        data-testid="maplibre-map"
      />
      {mapLoadStatus === 'loading' ? (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md bg-background/82 px-3 py-2 text-xs text-white/70 backdrop-blur-md">
          Loading NYC map...
        </div>
      ) : null}
      {mapError ? (
        <div className="absolute left-4 right-4 top-4 z-10 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive backdrop-blur-md">
          {mapError}
        </div>
      ) : null}
    </div>
  );
}

export default MapView;
