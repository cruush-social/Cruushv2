import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import SignalBadge from './SignalBadge';
import DlModePhotoPlaceholder from './DlModePhotoPlaceholder';
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
  Fuel,
  HeartHandshake,
  KeyRound,
  Martini,
  MapPinned,
  MicVocal,
  Music2,
  PackageOpen,
  Route,
  Shapes,
  Users,
  ShoppingBag,
  ShoppingCart,
  Toilet,
  TrainFront,
  TrainTrack,
  TreeDeciduous,
  Trees,
  Trophy,
  User,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import beachUmbrellaIcon from '../assets/ui-icons/beach-umbrella-1689481.png';
import purgatoryHeartOverlay from '../assets/ui-icons/purgatory-heart-pin-overlay.svg';
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
  BadgeUnit,
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
import { useDlMode, shouldMaskPhoto, getNsfwPhotoRestriction } from '../lib/dlMode';
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

export type MapViewportBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

interface MapViewProps {
  onPinClick: (marker: MapMarker) => void;
  onMapClick?: () => void;
  onMapReady?: (map: MapLibreMap) => void;
  markers: MapMarker[];
  fitToMarkers?: boolean;
  focusCoordinates?: {
    approximateLatitude: number;
    approximateLongitude: number;
  } | null;
  focusArea?: {
    approximateLatitude: number;
    approximateLongitude: number;
    radiusMiles: number;
  } | null;
  initialViewport?: InitialViewport;
  initialZoom?: number;
  preserveInitialZoomOnLoad?: boolean;
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
const MAP_READY_TIMEOUT_MS = 15000;
const MOBILE_MARKER_LONG_PRESS_MS = 300;
const MOBILE_MARKER_LONG_PRESS_MOVE_TOLERANCE_PX = 10;
// Spot pins answer a press sooner and forgive more finger drift, so their
// titles actually surface on touch.
const PLACE_MARKER_LONG_PRESS_MS = 180;
const PLACE_MARKER_LONG_PRESS_MOVE_TOLERANCE_PX = 16;
const MAP_LABEL_FONT_FAMILY = 'Cormorant Garamond';
const MAP_LABEL_FONT_REGULAR = ['Cormorant Garamond'];
const MAP_LABEL_FONT_BOLD = ['Cormorant Garamond Bold', 'Cormorant Garamond'];
export const MAP_TILE_LABEL_SCALE = 1.5625;
const MAP_ACCESSIBILITY_TEXT_SCALE = 1.25;
const MAP_HOVER_TITLE_FONT_SIZE_PX = 15;
// Heart previews scale their containing layer to 1.38x. Keep the nested
// Signal and badge titles at the same effective size as an unscaled Spot title.
const MAP_HEART_HOVER_TITLE_FONT_SIZE_PX = MAP_HOVER_TITLE_FONT_SIZE_PX / 1.38;
export const MAP_PIN_UNIT_SCALE = 1;
export const MAP_MARKER_VIEWPORT_OVERSCAN = 0.15;
const MARKER_INTERACTION_SUPPRESS_MS = 350;
// Clustering hides individual people, so it starts later and gives up sooner:
// pins only merge when they are nearly on top of one another.
// Keep dense map pins grouped while zoomed out. These values match the
// approved map handoff and prevent nearby profile hearts from stacking.
const PERSON_CLUSTER_MAX_ZOOM = MAX_DISCOVERY_ZOOM;
// Idle side-badge footprint is wider than the visible heart. Vertical
// clearance follows the heart artwork, not that wider horizontal envelope.
const PERSON_HEART_FOOTPRINT_PX = 64;
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
// Spot markers sharing a coordinate to this many decimal places collapse into
// one cluster that fans out on tap rather than stacking.
const SAME_LOCATION_CLUSTER_PRECISION = 6;
const SAME_BUILDING_PROXIMITY_METERS = 160.9344; // Maximum member spread: 0.1 mile.
const SPIDERFY_RADIUS_PX = 86;
const SPIDERFY_SECOND_RING_RADIUS_PX = 122;
const SPIDERFY_SECOND_RING_AFTER = 10;
// The public Spot set is dense enough that neighbourhood zooms drew dozens of
// separate diamonds on top of each other, so clustering holds to a closer zoom.
// The radius tightens as the map comes in: a wide gather reads as one useful
// count from the city view, but the same width at street level would swallow a
// whole district into a single number.
const PLACE_CLUSTER_MAX_ZOOM = 15.5;

function placeClusterRadiusPx(zoom: number) {
  if (zoom >= 14.5) return 72;
  if (zoom >= 12.5) return 96;
  return 132;
}
// No two Spot pins or Spot clusters may sit closer than a pin footprint;
// anything nearer merges into one cluster.
const MIN_PLACE_SEPARATION_PX = 62;
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
  signature: string;
};

type SpiderfiedCluster = {
  center: {
    approximateLatitude: number;
    approximateLongitude: number;
  };
  memberIds: string[];
  // Keep the exact displayed members and coordinates from the expansion. A
  // viewport refresh caused by panning must not rearrange an open fan.
  members: MapMarker[];
  pinned: boolean;
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

function areInSameBuildingDisplayArea(group: Pick<MapMarker, 'approximateLatitude' | 'approximateLongitude'>[]) {
  if (group.length < 2) return false;
  // Check every pair: proximity to one anchor alone can hide a wider group.
  // Use displayed coordinates only; privacy radii do not widen this limit.
  const radians = Math.PI / 180;
  for (let first = 0; first < group.length; first += 1) {
    for (let second = first + 1; second < group.length; second += 1) {
      const a = group[first];
      const b = group[second];
      const latitudeDelta = (b.approximateLatitude - a.approximateLatitude) * radians;
      const longitudeDelta = (b.approximateLongitude - a.approximateLongitude) * radians;
      const haversine = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(a.approximateLatitude * radians) * Math.cos(b.approximateLatitude * radians)
        * Math.sin(longitudeDelta / 2) ** 2;
      const distance = 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
      if (!Number.isFinite(distance) || distance > SAME_BUILDING_PROXIMITY_METERS) return false;
    }
  }
  return true;
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

function getSpiderfyOffsets(count: number, clearancePx = 0, minimumRadius = 0): Array<[number, number]> {
  const firstRingCount = Math.min(count, SPIDERFY_SECOND_RING_AFTER);
  const firstRingRadius = Math.max(SPIDERFY_RADIUS_PX, minimumRadius,
    clearancePx / (2 * Math.sin(Math.PI / Math.max(2, firstRingCount))));
  return Array.from({ length: count }, (_, index) => {
    const isSecondRing = count > SPIDERFY_SECOND_RING_AFTER && index >= SPIDERFY_SECOND_RING_AFTER;
    const ringIndex = isSecondRing ? index - SPIDERFY_SECOND_RING_AFTER : index;
    const ringCount = isSecondRing ? count - SPIDERFY_SECOND_RING_AFTER : Math.min(count, SPIDERFY_SECOND_RING_AFTER);
    const radius = isSecondRing
      ? Math.max(SPIDERFY_SECOND_RING_RADIUS_PX, clearancePx ? firstRingRadius + clearancePx : 0,
        clearancePx / (2 * Math.sin(Math.PI / Math.max(2, ringCount))))
      : firstRingRadius;
    const angle = -Math.PI / 2 + (ringIndex / Math.max(1, ringCount)) * Math.PI * 2;

    return [
      Number((Math.cos(angle) * radius).toFixed(2)),
      Number((Math.sin(angle) * radius).toFixed(2)),
    ] as [number, number];
  });
}

function createSpiderfiedCluster(
  cluster: MapMarker,
  markers: MapMarker[],
  pinned: boolean,
): SpiderfiedCluster | null {
  const requestedMemberIds = cluster.cluster?.memberIds ?? [];
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  const members = requestedMemberIds
    .map((memberId) => markersById.get(memberId))
    .filter((marker): marker is MapMarker => Boolean(marker));

  if (members.length < 2) {
    return null;
  }

  return {
    center: {
      approximateLatitude: cluster.approximateLatitude,
      approximateLongitude: cluster.approximateLongitude,
    },
    memberIds: members.map((marker) => marker.id),
    members,
    pinned,
  };
}

function getSpiderfiedMarkerMap(_markers: MapMarker[], spiderfiedCluster: SpiderfiedCluster | null, zoom: number) {
  if (!spiderfiedCluster || spiderfiedCluster.memberIds.length < 2) {
    return new Map<string, DisplayMapMarker>();
  }

  const members = spiderfiedCluster.members;

  const peopleOnly = members.every((marker) => (marker.kind ?? 'person') === 'person');
  if (members.length < 2 || (!peopleOnly && new Set(members.map(coordinateKey)).size !== 1)) {
    return new Map<string, DisplayMapMarker>();
  }

  const owner = peopleOnly ? members.find((marker) => marker.isCurrentUser || marker.id === 'me') : undefined;
  const fannedMembers = members.filter((marker) => marker !== owner);
  // The full heart unit includes its badges and hover peak. The diagonal
  // clearance keeps adjacent rings and neighboring heart rectangles separate.
  // One heart-unit width between centres keeps the artwork clear without the
  // oversized diagonal gap that made a two-person fan span most of a phone.
  const clearance = peopleOnly ? 164 : 0;
  const offsets = getSpiderfyOffsets(fannedMembers.length, clearance, owner ? clearance : 0);
  // Spiderfy geometry is tied to map scale, never the current viewport origin.
  // Panning therefore keeps the fan unchanged; only zoom alters the geometry.
  const project = (marker: MapMarker) => mercatorPixelPoint(marker, zoom);
  const center = peopleOnly ? project({ ...members[0], ...spiderfiedCluster.center }) : null;

  return new Map(members.map((marker, index) => [
    marker.id,
    {
      ...marker,
      spiderfy: {
        offset: marker === owner ? [0, 0] as [number, number] : (() => {
          const offset = offsets[fannedMembers.indexOf(marker)];
          if (!center) return offset;
          const point = project(marker);
          return [center.x - point.x + offset[0], center.y - point.y + offset[1]] as [number, number];
        })(),
        index,
        count: members.length,
      },
    },
  ]));
}

function isMapMarker(value: MapMarker) {
  return Number.isFinite(value.approximateLatitude) && Number.isFinite(value.approximateLongitude);
}

function getMapViewportBounds(map: MapLibreMap): MapViewportBounds | null {
  const bounds = map.getBounds();
  const nextBounds = {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  };

  return Object.values(nextBounds).every(Number.isFinite) ? nextBounds : null;
}

export function isMarkerWithinViewportOverscan(
  marker: MapMarker,
  bounds: MapViewportBounds | null,
  overscan = MAP_MARKER_VIEWPORT_OVERSCAN,
) {
  if (!bounds || !isMapMarker(marker)) {
    return true;
  }

  const latitudePadding = (bounds.north - bounds.south) * overscan;
  const longitudePadding = (bounds.east - bounds.west) * overscan;
  return marker.approximateLatitude >= bounds.south - latitudePadding
    && marker.approximateLatitude <= bounds.north + latitudePadding
    && marker.approximateLongitude >= bounds.west - longitudePadding
    && marker.approximateLongitude <= bounds.east + longitudePadding;
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
 * Member coordinates are authoritative geographic display locations. Clustering
 * may replace nearby members, but individual pins never move to avoid overlap.
 * Members fan out with temporary screen offsets only after opening a cluster.
 */
export function separateOverlappingMarkers(markers: MapMarker[], _zoom: number) {
  return markers;
}

function canClusterMarker(marker: MapMarker, focusCoordinates: MapViewProps['focusCoordinates']) {
  if ((marker.kind ?? 'person') !== 'person') return false;
  // The signed-in member and their owner-only Ghost decoy are map anchors.
  // They remain individual and never contribute to another cluster's count.
  if (marker.isCurrentUser === true || marker.id === 'me' || marker.id === 'me-ghost-decoy') return false;
  // An expired decoy is hidden by its individual artwork. It must not remain
  // discoverable through a cluster count after that same visibility deadline.
  return marker.displayMode !== 'GHOST'
    || typeof marker.ghostRotationExpiresAtMs !== 'number' || marker.ghostRotationExpiresAtMs > Date.now();
}

function groupNearbyMarkers(markers: DisplayMapMarker[], zoom: number, radiusPx: number, includeBoundary = false, peopleGeometry = false, acceptGroup?: (group: DisplayMapMarker[]) => boolean): DisplayMapMarker[][] {
  const radius = radiusPx / (2 ** zoom);
  type Entity = { id: number; group: DisplayMapMarker[]; x: number; y: number; owner: boolean; children?: [Entity, Entity] };
  const seeds: Entity[] = [...markers].sort((a, b) => a.id.localeCompare(b.id)).map((marker, id) => ({
    id, group: [marker], ...mercatorPixelPoint(marker, 0),
    owner: peopleGeometry && (marker.isCurrentUser === true || marker.id === 'me'),
  }));
  if (seeds.length < 2) return seeds.map((entity) => entity.group);
  const bounds = seeds.reduce((box, entity) => ({
    left: Math.min(box.left, entity.x), right: Math.max(box.right, entity.x),
    top: Math.min(box.top, entity.y), bottom: Math.max(box.bottom, entity.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  // Every aggregate center stays inside these bounds. If even the diagonal
  // clears the merge radius, the hierarchy can only end in this one group.
  if (Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) < radius
    && !peopleGeometry
    && (!acceptGroup || acceptGroup(markers))) {
    return [seeds.flatMap((entity) => entity.group)];
  }
  type Pair = { distance: number; a: number; b: number };
  const entities = new Map(seeds.map((entity) => [entity.id, entity]));
  const cells = new Map<string, Set<number>>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / radius)}:${Math.floor(y / radius)}`;
  const addToCell = (entity: Entity) => {
    const key = cellKey(entity.x, entity.y);
    const cell = cells.get(key) ?? new Set<number>();
    cell.add(entity.id);
    cells.set(key, cell);
  };
  const removeFromCell = (entity: Entity) => {
    const key = cellKey(entity.x, entity.y);
    const cell = cells.get(key);
    cell?.delete(entity.id);
    if (cell?.size === 0) cells.delete(key);
  };
  // Fixed-scale distances and a total tie order define one hierarchy at every
  // zoom. Each active center retains only its nearest pair, so dense views do
  // not allocate a quadratic heap of pairs that become stale after merging.
  const nearest = new Map<number, Pair>();
  const comparePairs = (first: Pair, second: Pair) => first.distance - second.distance || first.a - second.a || first.b - second.b;
  const peopleFootprints = (entity: Entity) => {
    const halfHeart = PERSON_HEART_FOOTPRINT_PX / 2;
    const footprints = [{ left: -halfHeart, right: halfHeart, top: -halfHeart, bottom: halfHeart }];
    if (entity.group.length === 1) {
      const marker = entity.group[0];
      // The artwork is centered in the existing 103px unit. Side badges are
      // 35px circles at 70% of its 80px heart layer, with the original -10.5px edge.
      if (marker.roleBadge) footprints.push({ left: -62, right: -27, top: -1.5, bottom: 33.5 });
      if (marker.badge) footprints.push({ left: 27, right: 62, top: -1.5, bottom: 33.5 });
    }
    return footprints;
  };
  const considerPair = (entity: Entity, other: Entity) => {
    if (entity.id === other.id) return;
    const dx = entity.x - other.x;
    const dy = entity.y - other.y;
    if (peopleGeometry) {
      const screenX = dx * 2 ** zoom;
      const screenY = dy * 2 ** zoom;
      const overlaps = peopleFootprints(entity).some((first) => peopleFootprints(other).some((second) => (
        first.left + screenX < second.right && first.right + screenX > second.left
        && first.top + screenY < second.bottom && first.bottom + screenY > second.top
      )));
      if (!overlaps) return;
    }
    const distance = peopleGeometry ? Math.max(dx * dx, dy * dy) : dx * dx + dy * dy;
    if (includeBoundary ? distance > radius * radius : distance >= radius * radius) return;
    const previous = nearest.get(entity.id);
    if (previous && distance > previous.distance) return;
    const a = entity.id < other.id ? entity.id : other.id;
    const b = entity.id > other.id ? entity.id : other.id;
    if (!previous || distance < previous.distance || a < previous.a || (a === previous.a && b < previous.b)) {
      nearest.set(entity.id, { distance, a, b });
    }
  };
  const findNearest = (entity: Entity) => {
    nearest.delete(entity.id);
    const cellX = Math.floor(entity.x / radius);
    const cellY = Math.floor(entity.y / radius);
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (const id of cells.get(`${cellX + x}:${cellY + y}`) ?? []) {
          considerPair(entity, entities.get(id)!);
        }
      }
    }
  };
  seeds.forEach(addToCell);
  seeds.forEach(findNearest);
  let nextId = seeds.length;
  while (nearest.size) {
    let pair: Pair | undefined;
    for (const candidate of nearest.values()) {
      if (!pair || comparePairs(candidate, pair) < 0) pair = candidate;
    }
    if (!pair) break;
    const first = entities.get(pair.a)!;
    const second = entities.get(pair.b)!;
    const count = first.group.length + second.group.length;
    const owner = first.owner ? first : second.owner ? second : null;
    const merged: Entity = {
      id: nextId++, group: [...first.group, ...second.group], children: [first, second],
      owner: Boolean(owner),
      x: owner?.x ?? (first.x * first.group.length + second.x * second.group.length) / count,
      y: owner?.y ?? (first.y * first.group.length + second.y * second.group.length) / count,
    };
    removeFromCell(first);
    removeFromCell(second);
    entities.delete(first.id);
    entities.delete(second.id);
    nearest.delete(first.id);
    nearest.delete(second.id);
    entities.set(merged.id, merged);
    addToCell(merged);
    for (const entity of entities.values()) {
      const previous = nearest.get(entity.id);
      if (entity.id === merged.id || (previous && (!entities.has(previous.a) || !entities.has(previous.b)))) {
        findNearest(entity);
      } else {
        considerPair(entity, merged);
      }
    }
  }
  const collect = (entity: Entity): DisplayMapMarker[][] => {
    if (!acceptGroup || entity.group.length === 1 || acceptGroup(entity.group)) return [entity.group];
    return entity.children!.flatMap(collect);
  };
  return [...entities.values()].flatMap(collect);
}

function buildPeopleCluster(group: MapMarker[], action: 'zoom' | 'spiderfy' = 'zoom'): MapMarker {
  const members = [...group].sort((a, b) => a.id.localeCompare(b.id));
  const sortedIds = members.map((marker) => marker.id);
  const count = group.length;
  const label = getClusterLabel(count);
  const clusterHash = hashString(sortedIds.join('|'));
  const averageLatitude = members.reduce((sum, marker) => sum + marker.approximateLatitude, 0) / count;
  const averageLongitude = members.reduce((sum, marker) => sum + marker.approximateLongitude, 0) / count;
  const owner = members.find((marker) => marker.isCurrentUser || marker.id === 'me');

  return {
    id: `people-cluster-${clusterHash}`,
    kind: 'cluster',
    displayName: label,
    approximateLatitude: owner?.approximateLatitude ?? averageLatitude,
    approximateLongitude: owner?.approximateLongitude ?? averageLongitude,
    cluster: {
      id: `people-${clusterHash}`,
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
  const activeSpiderfyIds = new Set(spiderfiedCluster?.memberIds ?? []);
  // Preserve the expanded set exactly until a zoom event closes it. Discovery
  // data is viewport-scoped, so panning can otherwise replace or reorder these
  // members even though the map scale did not change.
  const stableMarkers = spiderfiedCluster
    ? [
      ...markers.filter((marker) => !activeSpiderfyIds.has(marker.id)),
      ...spiderfiedCluster.members,
    ]
    : markers;
  const spiderfiedMarkersById = getSpiderfiedMarkerMap(stableMarkers, spiderfiedCluster, zoom);
  const spiderfiedIds = new Set(spiderfiedMarkersById.keys());

  const clusteredIds = new Set<string>();
  const clusterableMarkers = stableMarkers
    .filter((marker) => canClusterMarker(marker, focusCoordinates))
    .filter((marker) => !spiderfiedIds.has(marker.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const clusters: MapMarker[] = [];

  // Grouping is purely by real-world same-building overlap, never by a
  // zoom-scaled pixel radius. Two people either share a building or they
  // don't; that fact does not change as the map zooms in or out, so this
  // must not either.
  const visited = new Set<string>();
  clusterableMarkers.forEach((marker) => {
    if (visited.has(marker.id)) return;
    const group = [marker];
    visited.add(marker.id);
    let grew = true;
    while (grew) {
      grew = false;
      clusterableMarkers.forEach((candidate) => {
        if (visited.has(candidate.id)) return;
        if (areInSameBuildingDisplayArea([...group, candidate])) {
          group.push(candidate);
          visited.add(candidate.id);
          grew = true;
        }
      });
    }
    if (group.length < 2) return;
    group.forEach((groupMarker) => clusteredIds.add(groupMarker.id));
    clusters.push(buildPeopleCluster(group, 'spiderfy'));
  });

  // Keep the same cluster button at its anchor during expansion so a
  // desktop click after hover (or a tap after a hold) can pin it open.
  if (spiderfiedCluster && spiderfiedIds.size >= 2) {
    const members = stableMarkers.filter((marker) => spiderfiedIds.has(marker.id) && canClusterMarker(marker, focusCoordinates));
    if (members.length >= 2 && members.every((marker) => (marker.kind ?? 'person') === 'person')) {
      clusters.push(buildPeopleCluster(members, 'spiderfy'));
    }
  }

  return [
    ...stableMarkers
      .filter((marker) => !clusteredIds.has(marker.id))
      .map((marker) => spiderfiedMarkersById.get(marker.id) ?? marker),
    ...clusters,
  ];
}

function buildPlaceCluster(
  group: DisplayMapMarker[],
): MapMarker {
  const count = group.length;
  const members = [...group].sort((a, b) => a.id.localeCompare(b.id));
  const sortedIds = members.map((marker) => marker.id);
  const clusterHash = hashString(sortedIds.join('|'));
  const averageLatitude = members.reduce((sum, marker) => sum + marker.approximateLatitude, 0) / count;
  const averageLongitude = members.reduce((sum, marker) => sum + marker.approximateLongitude, 0) / count;
  const representative = members[0];

  return {
    id: `place-cluster-${clusterHash}`,
    kind: 'cluster',
    displayName: representative.displayName,
    approximateLatitude: averageLatitude,
    approximateLongitude: averageLongitude,
    place: representative.place,
    cluster: {
      id: `places-${clusterHash}`,
      count,
      label: `${count} spots`,
      kind: 'place',
      memberIds: sortedIds,
      action: 'zoom',
    },
  };
}

export function applyPlaceMarkerClusters(markers: DisplayMapMarker[], zoom: number): DisplayMapMarker[] {
  const placeMarkers = markers
    .filter((marker) => marker.kind === 'place' && !marker.spiderfy)
    .sort((a, b) => a.id.localeCompare(b.id));
  const clusteredIds = new Set<string>();
  const clusters: MapMarker[] = [];

  // Exact-coordinate Spots stay a Spot cluster. Spiderfy is reserved for
  // people sharing a building; the representative Spot opens at street zoom.
  Array.from(groupMarkersByCoordinate(placeMarkers).values())
    .filter((group) => group.length >= 2)
    .forEach((group) => {
      group.forEach((marker) => clusteredIds.add(marker.id));
      clusters.push(buildPlaceCluster(group));
    });

  if (zoom >= PLACE_CLUSTER_MAX_ZOOM) {
    return [...markers.filter((marker) => !clusteredIds.has(marker.id)), ...clusters];
  }

  const merged = groupNearbyMarkers(
    placeMarkers.filter((marker) => !clusteredIds.has(marker.id)),
    zoom,
    Math.max(MIN_PLACE_SEPARATION_PX, placeClusterRadiusPx(zoom)),
  );
  const singles: DisplayMapMarker[] = [];
  merged.forEach((group) => {
    if (group.length >= 2) {
      group.forEach((marker) => clusteredIds.add(marker.id));
      clusters.push(buildPlaceCluster(group));
    } else {
      singles.push(...group);
    }
  });
  const singleIds = new Set(singles.map((marker) => marker.id));

  return [...markers.filter((marker) => !clusteredIds.has(marker.id) || singleIds.has(marker.id)), ...clusters];
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
  revealed = false,
}: {
  badge: MapMarkerBadge | null | undefined;
  marker: MapMarker;
  isCurrentUser: boolean;
  side: 'left' | 'right';
  revealed?: boolean;
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

  const DisplayGlyph = badge.iconPath
    ? ({ className }: { className?: string }) => <img alt="" className={`${className ?? ''} object-contain brightness-0 invert`} src={badge.iconPath} />
    : Glyph;

  if (!DisplayGlyph && !hanky) {
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
  const displayedBadgeLabel = badge.meaning ?? hoverLabel;

  return (
    <span
      aria-label={badge.saved
        ? `${side === 'left' ? 'left' : 'right'} badge: ${displayedBadgeLabel}`
        : `${side === 'left' ? 'role' : 'position'}: ${displayedBadgeLabel}`}
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
      <BadgeUnit
        fillWithGlyph={savedBadge.fillsFrame}
        className="h-full w-full"
        frame={frame}
        gradientStops={badgeGradientStops}
        hankyColor={hanky?.color}
        strokeColor={marker.displayMode === 'GHOST' ? `var(--cruush-ghost-flash-border-color, ${badgeBorderColor})` : badgeBorderColor}
        glyph={DisplayGlyph ?? savedBadge.icon}
        glyphClassName="cruush-ghost-rotation-badge-symbol h-full w-full"
        contentClassName={`flex h-full w-full items-center justify-center text-white ${isCurrentUser && marker.displayMode === 'GHOST' ? 'overflow-hidden rounded-full' : ''}`}
      />
      <BadgeHoverLabel align={side === 'left' ? 'start' : 'end'} compactHorizontalPadding compactVerticalPadding revealed={revealed}>
        <span style={revealed ? { fontSize: MAP_HEART_HOVER_TITLE_FONT_SIZE_PX } : undefined}>{displayedBadgeLabel}</span>
      </BadgeHoverLabel>
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

// Pepper's ghost: the lit parts of the pin turn spectral electric blue while
// the dark parts stay dark, the way a reflected stage apparition reads.
const GHOST_PEPPER_FILTER = 'grayscale(1) sepia(1) saturate(2.6) hue-rotate(155deg) brightness(1.04) contrast(0.9)';

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

function GhostRotationPulse({ marker, children }: { marker: MapMarker; children: (exitActive: boolean, exitStyle?: CSSProperties) => ReactNode }) {
  const expiresAtMs = marker.ghostRotationExpiresAtMs;
  const canAnimate = marker.displayMode === 'GHOST' &&
    marker.animationHint === 'FADE_LAST_MINUTE' &&
    typeof expiresAtMs === 'number' &&
    !shouldReduceMotion();
  const [exitElapsedMs, setExitElapsedMs] = useState<number | null>(null);
  const pulseRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!canAnimate || typeof expiresAtMs !== 'number') {
      setExitElapsedMs(null);
      return;
    }
    const remainingMs = expiresAtMs - Date.now();
    const exitStartMs = remainingMs - GHOST_ROTATION_EXIT_MS;
    if (exitStartMs <= 0) {
      setExitElapsedMs(-exitStartMs);
      return;
    }
    // Keep the completed exit hidden until a fresh rotation arrives. Ending it
    // at the deadline briefly revealed the old location during the fetch.
    setExitElapsedMs(null);
    const exitTimer = window.setTimeout(() => setExitElapsedMs(0), exitStartMs);
    return () => window.clearTimeout(exitTimer);
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
        effectHost.style.setProperty('--cruush-ghost-pepper-opacity', visibleFlash ? '0.72' : '1');
        if (visibleFlash) {
          effectHost.style.setProperty('--cruush-ghost-surface-alpha', '0.34');
        } else {
          effectHost.style.removeProperty('--cruush-ghost-surface-alpha');
        }
        effectHost.style.setProperty(
          '--cruush-ghost-photo-filter',
          visibleFlash >= 0.5
            ? GHOST_PEPPER_FILTER
            : 'none',
        );
        effectHost.style.setProperty(
          '--cruush-ghost-pepper-filter',
          visibleFlash >= 0.5
            ? GHOST_PEPPER_FILTER
            : 'none',
        );
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


function withMapPhotoRetry(url: string) {
  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  return `${base}${base.includes('?') ? '&' : '?'}cruushPhotoRetry=1${hash}`;
}

function MarkerHeart({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [retryingPhoto, setRetryingPhoto] = useState<string | null>(null);
  const dlModeActive = useDlMode();

  const isOwnStealthMarker = isCurrentUser && marker.ownerStealthActive === true;
  const photoMasked = Boolean(marker.photo && shouldMaskPhoto(dlModeActive, marker.photoExplicit, {
    ...marker.photoRelationship,
    isMutualCruush: marker.relationship?.kind === 'mutual_cruush',
    sharesCrowd: marker.photoRelationship?.sharesCrowd ?? marker.hasSharedCrowd === true,
  }));
  const visiblePhoto = marker.photo && marker.photo !== failedPhoto && !shouldMaskPhoto(dlModeActive, marker.photoExplicit, {
    ...marker.photoRelationship,
    isMutualCruush: marker.relationship?.kind === 'mutual_cruush',
    sharesCrowd: marker.photoRelationship?.sharesCrowd ?? marker.hasSharedCrowd === true,
  })
    ? retryingPhoto === marker.photo
      ? withMapPhotoRetry(resolveMediaUrl(marker.photo))
      : resolveMediaUrl(marker.photo)
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
  // Owner-only. Freezing a ghosted traveller's contrail for everyone told other
  // members that Ghost Mode was on. Outside the last-minute rotation animation,
  // a ghosted profile must look like any other profile.
  const staticGhostTraveller = travellerActive && isCurrentUser && marker.displayMode === 'GHOST';
  const hideOwnerDecoyHeartStroke = staticGhostTraveller && isOwnGhostMarker;
  const ghostDecoyFadeStyle = isOwnGhostMarker
    ? ownerGhostDecoyFadeStyle(marker, isCurrentUser)
    : undefined;
  const handlePhotoError = () => {
    const photo = marker.photo ?? null;
    if (photo && retryingPhoto !== photo) {
      setRetryingPhoto(photo);
      return;
    }
    setFailedPhoto(photo);
  };

  return (
    <svg
      aria-hidden="true"
      className={`relative z-10 h-20 w-20${marker.outOfSight === true && !isNpcGhostDemo ? ' overflow-visible' : ''}`}
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
              onError={handlePhotoError}
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
            onError={handlePhotoError}
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
          {/* Your Ghost decoy is the apparition from the rotation animation:
              the translucent photo behind the electric-blue border, and
              nothing drawn over it. */}
          {isOwnGhostMarker || photoMasked ? null : (
            <foreignObject data-testid={`marker-current-fallback-${marker.id}`} height="36" width="36" x="14" y="16">
              <div className="flex h-9 w-9 items-center justify-center">
                <User aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={2.4} />
              </div>
            </foreignObject>
          )}
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
      {photoMasked ? (
        <foreignObject x="22" y="19" width="20" height="26">
          <DlModePhotoPlaceholder className="h-full w-full" showLabel={false} restriction={getNsfwPhotoRestriction(marker.photoExplicit, marker.photoRelationship)} />
        </foreignObject>
      ) : null}
      {travellerActive ? (
        <MileHighContrail
          forceReducedMotion={staticGhostTraveller}
          gradientId={travelGradientId}
          marker={marker}
        />
      ) : null}
      {pingActive && !travellerActive ? <PulseEkgHeartTrace clipId={clipId} /> : null}
      {marker.outOfSight === true && !isNpcGhostDemo ? (
        <image
          data-testid={`marker-purgatory-heart-overlay-${marker.id}`}
          height="72"
          href={purgatoryHeartOverlay}
          pointerEvents="none"
          width="64"
          x="0"
          y="-8"
        />
      ) : null}
    </svg>
  );
}

function VenueClusterMarker({ marker }: { marker: MapMarker }) {
  const count = marker.cluster?.count ?? 0;

  return (
    <span
      className="relative flex h-12 w-12 rotate-45 items-center justify-center rounded-[0.7rem] border-2 border-[#55C8FF] bg-black/94 text-white backdrop-blur-md"
      data-testid={`venue-cluster-marker-${marker.cluster?.id ?? marker.id}`}
    >
      <span className="cruush-logo-font flex -rotate-45 items-center text-2xl font-normal leading-none tracking-normal">
        {count > 999 ? '999+' : count}
      </span>
    </span>
  );
}

function PeopleClusterMarker({ marker }: { marker: MapMarker }) {
  const count = marker.cluster?.count ?? 0;

  return (
    <span
      className="cruush-logo-font flex h-16 min-w-16 items-center justify-center rounded-full border border-[3.2px] border-[#FF0072]/70 bg-black/86 px-4 text-2xl font-normal leading-none tracking-normal text-white backdrop-blur-md"
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
  rail_station: { icon: TrainFront },
  bus_stop: { icon: MapPinned },
  parking: { icon: CircleParking },
  beach: { special: 'beach' },
  adult_venue: { special: 'adult' },
  adult_shop: { icon: PackageOpen },
  music_venue: { icon: MicVocal },
  sports_venue: { icon: Trophy },
  retail: { icon: ShoppingCart },
  woods: { icon: TreeDeciduous },
  rest_stop: { icon: Fuel },
  bridge: { icon: TrainTrack },
  other: { icon: Shapes },
};

function PlaceMarker({ marker, previewed = false }: { marker: MapMarker; previewed?: boolean }) {
  const activeCheckins = marker.place?.activeCheckins ?? 0;
  const active = activeCheckins > 0;
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
        className={`pointer-events-none absolute bottom-[calc(100%+2rem)] left-1/2 z-20 w-max max-w-[15rem] -translate-x-1/2 transition-opacity duration-150 ${previewed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
      >
        <SignalBadge
          borderColor="#55C8FF"
          className="block shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
          compactHorizontalPadding
          testId={`place-marker-title-${marker.place?.id ?? marker.id}`}
        >
          <span style={{ fontSize: MAP_HOVER_TITLE_FONT_SIZE_PX }}>{marker.displayName}</span>
        </SignalBadge>
      </span>
      <span className={`relative flex h-12 w-12 origin-center rotate-45 items-center justify-center rounded-[0.7rem] border-2 border-[#55C8FF] bg-black/94 text-white backdrop-blur-md transition-transform duration-150 ${previewed ? 'scale-[1.38]' : ''}`}>
        <span className="flex h-8 w-8 -rotate-45 items-center justify-center">
          {config.special === 'beach' ? <img src={beachUmbrellaIcon} alt="" className="h-7 w-7 brightness-0 invert" /> : null}
          {config.special === 'stairs' ? <span aria-hidden="true" className="relative block h-6 w-6"><i className="absolute bottom-1 left-0 h-[3px] w-2.5 rounded-full bg-white" /><i className="absolute bottom-2.5 left-[7px] h-[3px] w-2.5 rounded-full bg-white" /><i className="absolute bottom-4 left-3.5 h-[3px] w-2.5 rounded-full bg-white" /></span> : null}
          {config.special === 'adult' ? <span className="cruush-logo-font text-[21px] font-normal leading-none tracking-normal">18+</span> : null}
          {!config.special ? <Icon className="h-6 w-6" /> : null}
        </span>
        {active ? <span data-testid="spot-checkin-count" title={`${activeCheckins} checked in`} className="absolute -right-2 -top-2 flex h-6 min-w-6 -rotate-45 items-center justify-center rounded-full bg-[#55C8FF] px-1 text-[10px] font-bold text-black"><Users className="mr-0.5 h-3 w-3" aria-hidden="true" />{activeCheckins > 999 ? '999+' : activeCheckins}</span> : null}
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
  const otherGhostDeadline = !isCurrentUser && marker.displayMode === 'GHOST'
    && typeof marker.ghostRotationExpiresAtMs === 'number'
    ? marker.ghostRotationExpiresAtMs : null;
  const [expiredGhostDeadline, setExpiredGhostDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (otherGhostDeadline == null) return;
    const timer = window.setTimeout(() => setExpiredGhostDeadline(otherGhostDeadline), Math.max(0, otherGhostDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [otherGhostDeadline]);
  const awaitingGhostPosition = otherGhostDeadline != null
    && (expiredGhostDeadline === otherGhostDeadline || otherGhostDeadline <= Date.now());
  const isOwnerGhostDecoy = isCurrentUser && marker.displayMode === 'GHOST';
  const isPerson = marker.kind == null || marker.kind === 'person';
  const signalPreview = isPerson ? truncateMarkerPreview(marker.signal) : '';
  const pingActive = Boolean(marker.activePing);
  const travellerActive = marker.travelling === true
    && !(isCurrentUser && marker.ownerStealthActive === true)
    && !pingActive;
  // The signal capsule wears the same border as the unit it belongs to, so the
  // pin and its caption read as one object.
  const signalBorderColor = getMarkerBorderColor(marker, isCurrentUser);

  if (marker.kind === 'cluster') {
    return isPersonCluster(marker)
      ? <PeopleClusterMarker marker={marker} />
      : <VenueClusterMarker marker={marker} />;
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
      data-awaiting-ghost-position={awaitingGhostPosition ? 'true' : undefined}
      style={awaitingGhostPosition ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
    >
      <span
        className={`cruush-ghost-rotation-unit-material relative flex h-20 w-[103px] origin-bottom items-center justify-center transition-transform duration-150 ${previewed ? 'scale-[1.38]' : ''} ${pingActive && !travellerActive ? 'cruush-map-ping-heart' : ''}`}
        data-testid={`marker-heart-layer-${marker.id}`}
      >
        <GhostRotationPulse marker={marker}>
          {(exitActive, exitStyle) => <>
            <span className={exitActive ? 'cruush-ghost-rotation-heart-exit' : ''} style={exitStyle}>
              <MarkerHeart marker={marker} isCurrentUser={isCurrentUser} />
              <MarkerSideBadge badge={marker.roleBadge} marker={marker} isCurrentUser={isCurrentUser} side="left" revealed={previewed} />
              <MarkerSideBadge badge={marker.badge} marker={marker} isCurrentUser={isCurrentUser} side="right" revealed={previewed} />
            </span>
            {(signalPreview || isOwnerGhostDecoy) && !exitActive ? (
              <span
                className={`absolute left-1/2 top-0 z-30 flex w-max max-w-none origin-bottom -translate-x-1/2 -translate-y-full flex-col items-center gap-1 transition-opacity ${previewed ? 'scale-[0.7246376812] opacity-100 delay-150 duration-150' : pingActive ? 'opacity-100 duration-150' : 'opacity-0 duration-0'}`}
                data-signal-position="v2-frame-top"
                data-testid={`marker-signal-stack-${marker.id}`}
              >
                <SignalBadge
                  borderColor={signalBorderColor}
                  className={getMileHighRingClass(marker)}
                  testId={`marker-signal-badge-${marker.id}`}
                >
                  {pingActive ? <PulseEkgSignalTrace /> : null}
                  <span className="cruush-ghost-rotation-signal-symbol relative whitespace-nowrap [overflow-wrap:normal]" style={{ fontSize: MAP_HOVER_TITLE_FONT_SIZE_PX }}>
                    {isOwnerGhostDecoy
                      ? <GhostRotationCountdown expiresAtMs={marker.ghostRotationExpiresAtMs} />
                      : signalPreview}
                  </span>
                </SignalBadge>
              </span>
            ) : null}
          </>}
        </GhostRotationPulse>
      </span>
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
  onPinPreviewEnd: (marker: MapMarker, relatedTarget: EventTarget | null) => void,
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
  const supportsHoldPreview = marker.kind == null || marker.kind === 'person' || marker.kind === 'place' || isSpiderfyCluster(marker);
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
    if (nextPreviewed) {
      restingZIndex = element.style.zIndex;
      element.style.zIndex = String(SIGNAL_PREVIEW_MARKER_Z_INDEX);
    } else if (restingZIndex != null) {
      element.style.zIndex = restingZIndex;
      restingZIndex = null;
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
        ? `Open ${name} Pink Book`
      : `Open ${name} on map`);
    if (supportsHoldPreview) {
      button.setAttribute('aria-pressed', 'false');
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
      if (pointerEvent.pointerType !== 'touch') {
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
        }, marker.kind === 'place' ? PLACE_MARKER_LONG_PRESS_MS : MOBILE_MARKER_LONG_PRESS_MS);
      }
    });
    button.addEventListener('pointermove', (event) => {
      if (!touchStartPoint || longPressTimer == null) {
        return;
      }

      const pointerEvent = event as PointerEvent;
      const movedX = Math.abs(pointerEvent.clientX - touchStartPoint.x);
      const movedY = Math.abs(pointerEvent.clientY - touchStartPoint.y);
      const moveTolerance = marker.kind === 'place'
        ? PLACE_MARKER_LONG_PRESS_MOVE_TOLERANCE_PX
        : MOBILE_MARKER_LONG_PRESS_MOVE_TOLERANCE_PX;
      if (movedX > moveTolerance || movedY > moveTolerance) {
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
        if ((marker as DisplayMapMarker).spiderfy) {
          onPinClick(marker);
          return;
        }
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
        onPinPreviewEnd(marker, pointerEvent.relatedTarget);
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
  fitToMarkers = false,
  focusCoordinates,
  focusArea,
  initialViewport,
  initialZoom,
  preserveInitialZoomOnLoad = false,
  radiusCircle,
  browseArea,
  ghostLeash,
  demoRadiusCircles = [],
  denseVenue = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<RenderedMapMarker[]>([]);
  const viewportMarkersRef = useRef<MapMarker[]>([]);
  const demoRadiusCirclesRef = useRef<RadiusCircle[]>([]);
  const mapLibreRef = useRef<MapLibreExport | null>(null);
  const appliedAreaRef = useRef<{ map: MapLibreMap; key: string } | null>(null);
  const initialViewportRef = useRef(initialViewport);
  const initialZoomRef = useRef(initialZoom);
  const browseAreaRef = useRef(browseArea);
  const autoFitFocusKeyRef = useRef<string | null>(null);
  const hasAppliedAutoFitRef = useRef(false);
  const directFocusRef = useRef<{ map: MapLibreMap; key: string } | null>(null);
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
  const [viewportBounds, setViewportBounds] = useState<MapViewportBounds | null>(null);
  const [largerMapText, setLargerMapText] = useState(
    () => getAccessibilityPreferences().largerText,
  );
  const [spiderfiedCluster, setSpiderfiedCluster] = useState<SpiderfiedCluster | null>(null);
  const [ghostClusterVisibilityTick, setGhostClusterVisibilityTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const deadline = markers.reduce((next, marker) => marker.displayMode === 'GHOST'
      && marker.isCurrentUser !== true && marker.id !== 'me'
      && typeof marker.ghostRotationExpiresAtMs === 'number' && marker.ghostRotationExpiresAtMs > now
      ? Math.min(next, marker.ghostRotationExpiresAtMs) : next, Infinity);
    if (!Number.isFinite(deadline)) return;
    const timer = window.setTimeout(() => setGhostClusterVisibilityTick((tick) => tick + 1), Math.max(0, deadline - now));
    return () => window.clearTimeout(timer);
  }, [markers, ghostClusterVisibilityTick]);
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
    [currentZoom, denseMarkerResult.markers, focusCoordinates, spiderfiedCluster, ghostClusterVisibilityTick],
  );
  const renderedMarkerSignature = useMemo(() => JSON.stringify(renderedMarkers), [renderedMarkers]);
  const renderedMarkersRef = useRef(renderedMarkers);
  renderedMarkersRef.current = renderedMarkers;
  const mountedMarkers = useMemo(
    () => renderedMarkers.filter((marker) => isMarkerWithinViewportOverscan(marker, viewportBounds)),
    [renderedMarkers, viewportBounds],
  );
  const mountedMarkerSignature = useMemo(() => JSON.stringify(mountedMarkers), [mountedMarkers]);
  const mountedMarkersRef = useRef(mountedMarkers);
  mountedMarkersRef.current = mountedMarkers;
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
        let readyTimeout: ReturnType<typeof window.setTimeout> | null = null;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: initialViewportRef.current
            ? [initialViewportRef.current.center.approximateLongitude, initialViewportRef.current.center.approximateLatitude]
            : DEFAULT_CENTER,
          zoom: initialViewportRef.current?.zoom ?? initialZoomRef.current ?? DEFAULT_ZOOM,
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
        // A restored camera can start above or below the default zoom. Cluster
        // against its actual scale before the first user zoom event.
        setCurrentZoom(map.getZoom());
        setViewportBounds(getMapViewportBounds(map));
        setMapInstance(map);

        const clearReadyTimeout = () => {
          if (readyTimeout == null) {
            return;
          }

          window.clearTimeout(readyTimeout);
          readyTimeout = null;
        };

        const markMapReady = () => {
          if (!isMounted || mapRef.current !== map) {
            return;
          }

          didLoad = true;
          clearReadyTimeout();
          setMapLoadStatus('ready');
          setMapError(null);
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

        readyTimeout = window.setTimeout(() => {
          readyTimeout = null;

          if (!isMounted || mapRef.current !== map || didLoad) {
            return;
          }

          setMapLoadStatus('error');
          setMapError(MAP_ERROR_MESSAGE);
        }, MAP_READY_TIMEOUT_MS);

        map.on('click', (event) => {
          const markerInteractionWasRecent = Date.now() - lastMarkerInteractionAtRef.current < MARKER_INTERACTION_SUPPRESS_MS;

          if (markerInteractionWasRecent || isMapClickFromMarker(event)) {
            return;
          }

          markersRef.current.forEach((renderedMarker) => renderedMarker.setPreviewed(false));
          setSpiderfiedCluster(null);
          onMapClickRef.current?.();
        });
        map.on('zoomstart', () => setSpiderfiedCluster(null));
        map.on('zoomend', () => {
          if (typeof map.getZoom === 'function') {
            setCurrentZoom(map.getZoom());
          }
        });
        // The complete marker set still drives clustering and auto-fit. This
        // only controls which finished map markers stay mounted after a pan.
        map.on('moveend', () => setViewportBounds(getMapViewportBounds(map)));
        map.on('style.load', handleMapStyleLoad);
        map.on('load', handleMapLoad);
        map.on('idle', markMapReady);
        map.on('error', (event) => {
          if (!isMounted || mapRef.current !== map) {
            return;
          }

          if (didLoad) {
            console.warn('Nonfatal map tile error after load:', event);
            return;
          }

          clearReadyTimeout();
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

    const areaKey = focusArea ? `area:${focusArea.approximateLatitude}:${focusArea.approximateLongitude}:${focusArea.radiusMiles}` : null;
    if (focusArea && !(appliedAreaRef.current?.map === map && appliedAreaRef.current.key === areaKey)) {
      const maplibregl = mapLibreRef.current;
      if (!map || !maplibregl || mapLoadStatus !== 'ready') return;
      const bounds = maplibregl.LngLatBounds.fromLngLat(
        new maplibregl.LngLat(focusArea.approximateLongitude, focusArea.approximateLatitude),
        focusArea.radiusMiles * 1609.344
      );
      // Fit the whole anonymous area above the existing bottom controls.
      const canvas = map.getCanvas();
      const edge = Math.min(120, Math.floor(canvas.clientWidth / 8));
      map.fitBounds(bounds, {
        padding: { top: Math.min(140, Math.floor(canvas.clientHeight / 4)),
          bottom: Math.min(170, Math.floor(canvas.clientHeight / 3)), left: edge, right: edge },
        maxZoom: MAX_DISCOVERY_ZOOM,
        duration: 500
      });
      appliedAreaRef.current = { map, key: areaKey! };
      directFocusRef.current = focusLatitude != null && focusLongitude != null
        ? { map, key: `${focusLatitude.toFixed(6)}:${focusLongitude.toFixed(6)}` }
        : null;
      return;
    }

    if (!map || focusLatitude == null || focusLongitude == null) {
      directFocusRef.current = null;
      return;
    }

    const visibleMarkers = viewportMarkersRef.current.flatMap((marker) => {
      if (!marker.cluster?.memberIds.length) return [marker];
      const members = new Set(marker.cluster.memberIds);
      return markers.filter((candidate) => members.has(candidate.id));
    });
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
    // A later location update on the same map only recentres. Reapplying the
    // zoom the map opened at would undo whatever the member zoomed to since.
    const refocusingSameMap = preserveInitialZoomOnLoad && directFocusRef.current?.map === map;
    if (!refocusingSameMap) {
      map.setZoom(preserveInitialZoomOnLoad
        ? initialZoomRef.current ?? FOCUSED_ZOOM
        : FOCUSED_ZOOM);
    }
    directFocusRef.current = { map, key: focusKey };
  }, [fitToMarkers, focusLatitude, focusLongitude, focusArea, mapInstance, mapLoadStatus, preserveInitialZoomOnLoad, viewportMarkerSignature]);

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
      if (getLayer(layerId) && removeLayer) {
        removeLayer(layerId);
      }
      if (getSource(sourceId) && removeSource) {
        removeSource(sourceId);
      }
      return;
    }

    const data = createGhostLeashFeature(ghostLeash);
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
    const maplibregl = mapLibreRef.current;

    if (!hasActiveMapStyle(map) || !maplibregl) {
      return;
    }

    const visibleMarkers = mountedMarkersRef.current.filter(isMapMarker);
    // Diff against the markers already on the map so a zoom step or one
    // changed pin no longer tears down and rebuilds every marker element.
    const nextSignatures = new Map(visibleMarkers.map((marker) => [marker.id, JSON.stringify(marker)]));
    const survivors = new Map<string, RenderedMapMarker>();
    markersRef.current.forEach((renderedMarker) => {
      const signature = nextSignatures.get(renderedMarker.id);
      if (signature != null && signature === renderedMarker.signature && !survivors.has(renderedMarker.id)) {
        survivors.set(renderedMarker.id, renderedMarker);
      } else {
        cleanupRenderedMarker(renderedMarker);
      }
    });
    markersRef.current = [...survivors.values()];
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      markersRef.current = visibleMarkers.map((marker) => {
        const survivor = survivors.get(marker.id);
        if (survivor) {
          return survivor;
        }
        const { dispose, element, root, setPreviewed } = createMarkerElement(
          marker,
          (selectedMarker) => {
            if (isSpiderfyCluster(selectedMarker)) {
              const nextSpiderfiedCluster = createSpiderfiedCluster(
                selectedMarker,
                denseMarkerResult.markers,
                true,
              );

              if (nextSpiderfiedCluster) {
                setSpiderfiedCluster(nextSpiderfiedCluster);
              }
              return;
            }

            if (!spiderfiedCluster?.pinned && spiderfiedCluster?.memberIds.includes(selectedMarker.id)) {
              setSpiderfiedCluster({ ...spiderfiedCluster, pinned: true });
              return;
            }

            if (isPersonCluster(selectedMarker) || isPlaceCluster(selectedMarker)) {
              if (isPlaceCluster(selectedMarker)) {
                setSpiderfiedCluster(null);
                const liveZoom = typeof map.getZoom === 'function' ? map.getZoom() : currentZoom;
                if (liveZoom >= PLACE_CLUSTER_MAX_ZOOM && selectedMarker.place) {
                  onPinClickRef.current({ ...selectedMarker, kind: 'place', cluster: undefined });
                  return;
                }
                map.setCenter([selectedMarker.approximateLongitude, selectedMarker.approximateLatitude]);
                map.setZoom(PLACE_CLUSTER_MAX_ZOOM);
                setCurrentZoom(PLACE_CLUSTER_MAX_ZOOM);
                return;
              }
              const memberIds = selectedMarker.cluster?.memberIds ?? [];
              const memberMarkers = denseMarkerResult.markers.filter((candidate) => memberIds.includes(candidate.id));
              const clusterMaxZoom = PERSON_CLUSTER_MAX_ZOOM;
              const coordinates = memberMarkers.map((candidate) => [
                candidate.approximateLongitude,
                candidate.approximateLatitude,
              ] as [number, number]);
              if (coordinates.length > 1 && typeof map.fitBounds === 'function') {
                const lngs = coordinates.map(([lng]) => lng);
                const lats = coordinates.map(([, lat]) => lat);
                setSpiderfiedCluster(null);
                // Padding wider than the map itself makes fitBounds a no-op, which
                // is why tapping some Spot clusters did nothing on a phone: 140px
                // each side leaves 110px of a 390px viewport.
                const frame = containerRef.current;
                const frameWidth = frame?.clientWidth ?? 0;
                const frameHeight = frame?.clientHeight ?? 0;
                const sidePadding = frameWidth > 0 ? Math.min(140, Math.floor(frameWidth * 0.18)) : 140;
                const topPadding = frameHeight > 0 ? Math.min(180, Math.floor(frameHeight * 0.18)) : 180;
                const bottomPadding = frameHeight > 0 ? Math.min(220, Math.floor(frameHeight * 0.22)) : 220;
                map.fitBounds(
                  [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                  {
                    padding: { top: topPadding, right: sidePadding, bottom: bottomPadding, left: sidePadding },
                    maxZoom: clusterMaxZoom,
                    duration: 450,
                  },
                );
                return;
              }
              const nextZoom = Math.min(clusterMaxZoom, currentZoom + PERSON_CLUSTER_ZOOM_STEP);
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
            if (isSpiderfyCluster(previewedMarker)) {
              const nextSpiderfiedCluster = createSpiderfiedCluster(
                previewedMarker,
                denseMarkerResult.markers,
                false,
              );
              if (nextSpiderfiedCluster) {
                setSpiderfiedCluster((current) => {
                  // A cluster remains under the pointer while its marker data
                  // refreshes during a pan. Keep the opened fan's snapshot in
                  // that case; otherwise the cards visibly reshuffle without
                  // any zoom change. Hovering a different cluster still opens
                  // that cluster as usual.
                  const sameCluster = current?.memberIds.length === nextSpiderfiedCluster.memberIds.length
                    && current.memberIds.every((memberId) => nextSpiderfiedCluster.memberIds.includes(memberId));
                  return current?.pinned || sameCluster ? current : nextSpiderfiedCluster;
                });
              }
              return;
            }
            markersRef.current.forEach((renderedMarker) => {
              renderedMarker.setPreviewed(renderedMarker.id === previewedMarker.id);
            });
          },
          (previewedMarker, relatedTarget) => {
            const nextMarker = relatedTarget instanceof Element
              ? relatedTarget.closest('[data-map-marker-id]')?.getAttribute('data-map-marker-id')
              : null;
            setSpiderfiedCluster((currentCluster) => {
              if (currentCluster?.pinned || (!currentCluster?.memberIds.includes(previewedMarker.id)
                && !isSpiderfyCluster(previewedMarker))) {
                return currentCluster;
              }
              return nextMarker && currentCluster.memberIds.includes(nextMarker) ? currentCluster : null;
            });
          },
          () => {
            lastMarkerInteractionAtRef.current = Date.now();
          },
        );
        const displayMarker = marker as DisplayMapMarker;
        element.dataset.mapMarkerId = marker.id;

        if (marker.activePing) {
          element.style.zIndex = String(ACTIVE_PING_MARKER_Z_INDEX);
        } else if (displayMarker.spiderfy) {
          element.dataset.spiderfyIndex = String(displayMarker.spiderfy.index);
          element.dataset.spiderfyCount = String(displayMarker.spiderfy.count);
          element.style.zIndex = String(40 + displayMarker.spiderfy.index);
        } else if (marker.kind == null || marker.kind === 'person' || isPersonCluster(marker)) {
          // People pins and people clusters always sit above Spot pins and
          // Spot clusters, so a person is never hidden behind a venue.
          // Keep owner artwork and its tap target above nearby cluster counts.
          element.style.zIndex = marker.isCurrentUser === true || marker.id === 'me' ? '41' : '40';
        } else {
          element.style.zIndex = '20';
        }

        const mapMarker = new maplibregl.Marker({
          element,
          subpixelPositioning: true,
          ...(displayMarker.spiderfy ? { offset: displayMarker.spiderfy.offset } : {}),
        })
          .setLngLat([marker.approximateLongitude, marker.approximateLatitude])
          .addTo(map);
        const renderedMarker: RenderedMapMarker = {
          dispose,
          id: marker.id,
          marker: mapMarker,
          root,
          setPreviewed,
          signature: nextSignatures.get(marker.id) ?? JSON.stringify(marker),
        };
        return renderedMarker;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [currentZoom, mapInstance, mountedMarkerSignature]);

  // A pinch on the map belongs to the map. Safari zooms the whole page on its
  // own gesture events, and a two-finger move can still reach the page where a
  // control sits above the canvas, so the map surface refuses both. MapLibre
  // still receives the touches and runs its own pinch zoom.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const swallow = (event: Event) => {
      event.preventDefault();
    };
    const swallowMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    surface.addEventListener('gesturestart', swallow, { passive: false });
    surface.addEventListener('gesturechange', swallow, { passive: false });
    surface.addEventListener('gestureend', swallow, { passive: false });
    surface.addEventListener('touchmove', swallowMultiTouch, { passive: false });

    return () => {
      surface.removeEventListener('gesturestart', swallow);
      surface.removeEventListener('gesturechange', swallow);
      surface.removeEventListener('gestureend', swallow);
      surface.removeEventListener('touchmove', swallowMultiTouch);
    };
  }, []);

  return (
    <div ref={surfaceRef} className="relative h-full w-full overflow-hidden bg-background" data-map-gesture-surface style={{ touchAction: 'pan-x pan-y' }}>
      <div
        ref={containerRef}
        className="cruush-map h-full w-full overflow-hidden bg-background"
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
