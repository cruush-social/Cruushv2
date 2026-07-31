import { useEffect, useMemo, useRef, useState } from 'react';
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
  ArrowDown,
  ArrowUp,
  Bed,
  CircleDot,
  MessageCircle,
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
import partyHatIcon from '../assets/ui-icons/party-hat.svg';
import { applyDenseVenueMarkers, type DenseVenueConfig } from '../lib/denseVenueMarkers';
import {
  createMapMarkerBadge,
  type MapMarker,
  type MapMarkerBadge,
} from '../lib/mapMarkers';
import { HEART_PIN_PATH, HEART_PIN_THEMES } from '../lib/heartPin';

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
const FOCUSED_ZOOM = 14;
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
const MARKER_INTERACTION_SUPPRESS_MS = 350;

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
  return createRasterStyle(DEFAULT_TILE_URLS, DEFAULT_ATTRIBUTION);
}

function canFallbackToDefaultRasterStyle(style: ReturnType<typeof getMapStyle>) {
  if (typeof style === 'string') {
    return false;
  }

  return Boolean(style.sources?.openmaptiles) && !style.sources?.osmRasterTiles;
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
          'background-color': '#080808',
        },
      },
      {
        id: 'landcover-base',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: {
          'fill-color': '#0f0f0f',
          'fill-opacity': 0.78,
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
            '#111111',
            '#0f0f0f',
          ],
          'fill-outline-color': '#1e1e1e',
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
          'line-color': '#1c1c1c',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.45, 16, 2.2],
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
          'line-color': '#242424',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 5.5],
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
          'line-color': ['match', ['get', 'class'], 'trunk', '#363636', '#2e2e2e'],
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
          'text-color': '#7f7f7f',
          'text-halo-color': '#080808',
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
          'text-color': '#a0a0a0',
          'text-halo-color': '#080808',
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
          'text-color': '#d0d0d0',
          'text-halo-color': '#080808',
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
          'text-halo-color': '#080808',
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
          'text-color': '#c0c0c0',
          'text-halo-color': '#080808',
          'text-halo-width': 1.6,
        },
      },
    ],
  };
}

export function getMapStyle() {
  const configuredStyleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim();

  if (configuredStyleUrl) {
    return configuredStyleUrl;
  }

  const configuredTileUrl = import.meta.env.VITE_MAP_TILE_URL?.trim();
  const configuredAttribution = import.meta.env.VITE_MAP_ATTRIBUTION?.trim();

  if (configuredTileUrl) {
    return createRasterStyle([configuredTileUrl], configuredAttribution || DEFAULT_ATTRIBUTION);
  }

  const configuredVectorTileJsonUrl = import.meta.env.VITE_MAP_VECTOR_TILEJSON_URL?.trim();
  const configuredGlyphsUrl = import.meta.env.VITE_MAP_GLYPHS_URL?.trim();

  return createCruushVectorStyle(
    configuredVectorTileJsonUrl || DEFAULT_VECTOR_TILEJSON_URL,
    configuredGlyphsUrl || undefined,
  );
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
  oral: MessageCircle,
  gooner: CircleDot,
};

type RenderedMapMarker = {
  marker: MapLibreMarker;
  root: Root;
};

function isMapMarker(value: MapMarker) {
  return Number.isFinite(value.approximateLatitude) && Number.isFinite(value.approximateLongitude);
}

function getDisplayName(marker: MapMarker) {
  return marker.displayName.trim() || 'person';
}

function shouldReduceMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getBadgeIcon(badge: MapMarkerBadge | null | undefined) {
  if (!badge?.iconName) {
    return null;
  }

  return POSITION_BADGE_ICONS[badge.iconName] ?? null;
}

function MarkerBadge({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  const badge = marker.badge;
  const Icon = getBadgeIcon(badge);

  if (!isCurrentUser && (!badge || !Icon)) {
    return null;
  }

  const borderClass = marker.relationship?.kind === 'mutual_cruush'
    ? 'border-[#6f00ff]/80'
    : isCurrentUser
      ? 'border-[#0BA8FF]/80'
      : 'border-[#FF0072]/80';

  return (
    <span
      aria-label={isCurrentUser ? 'Your profile' : badge?.label}
      className={[
        'absolute right-1.5 top-8 flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full border bg-black/85 text-white shadow-[0_4px_14px_rgba(0,0,0,0.55)] backdrop-blur-sm',
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

function MarkerRelationshipBadge({ marker }: { marker: MapMarker }) {
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
      className="absolute left-1.5 top-8 flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full border border-[#6f00ff]/80 bg-black/85 text-white/78 shadow-[0_4px_14px_rgba(0,0,0,0.55)] backdrop-blur-sm"
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
  const theme = isMutualCruush ? 'mutual' : isCurrentUser || isNpcGhostDemo ? 'current' : 'nearby';
  const markerTheme = HEART_PIN_THEMES[theme];
  const borderColor = markerTheme.border;
  const [gradientFrom, gradientMiddle, gradientTo] = markerTheme.stops;

  return (
    <svg
      aria-hidden="true"
      className="h-20 w-20"
      data-testid={`marker-heart-${marker.id}`}
      data-has-photo={hasPhoto ? 'true' : 'false'}
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
          <path d={HEART_PIN_PATH} />
        </clipPath>
      </defs>
      {hasPhoto ? (
        <>
          <image
            clipPath={`url(#${clipId})`}
            data-testid={`marker-photo-fill-${marker.id}`}
            height="64"
            href={resolvedPhoto}
            preserveAspectRatio="xMidYMid slice"
            width="64"
          />
          <path d={HEART_PIN_PATH} fill="none" stroke={borderColor} strokeWidth="3.2" />
        </>
      ) : isCurrentUser && !isMutualCruush ? (
        <>
          <path d={HEART_PIN_PATH} fill="#050505" stroke="#0BA8FF" strokeWidth="3.2" />
          <foreignObject data-testid={`marker-current-fallback-${marker.id}`} height="36" width="36" x="14" y="16">
            <div className="flex h-9 w-9 items-center justify-center">
              <User aria-hidden="true" className="h-7 w-7 text-white" strokeWidth={2.4} />
            </div>
          </foreignObject>
        </>
      ) : (
        <path d={HEART_PIN_PATH} fill={`url(#${gradientId})`} stroke={borderColor} strokeWidth="3.2" />
      )}
    </svg>
  );
}

function VenueClusterMarker({ marker }: { marker: MapMarker }) {
  const count = marker.cluster?.count ?? 0;

  return (
    <span
      className="flex h-16 min-w-16 items-center justify-center rounded-full border border-white/20 bg-black/82 px-4 text-xl font-semibold text-white shadow-[0_0_28px_rgba(255,0,114,0.34)] backdrop-blur-md"
      data-testid={`venue-cluster-marker-${marker.cluster?.id ?? marker.id}`}
    >
      {count > 999 ? '999+' : count}
    </span>
  );
}

function LaunchPartyMarker({ marker }: { marker: MapMarker }) {
  return (
    <span
      className="animate-cruush-party-dance flex h-16 w-16 items-center justify-center overflow-visible"
      data-testid={`launch-party-marker-${marker.id}`}
    >
      <img alt="" aria-hidden="true" className="h-full w-full object-contain drop-shadow-[0_8px_22px_rgba(0,0,0,0.55)]" draggable={false} src={partyHatIcon} />
    </span>
  );
}

function MapMarkerPin({ marker }: { marker: MapMarker }) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser === true;

  if (marker.kind === 'cluster') {
    return <VenueClusterMarker marker={marker} />;
  }

  if (marker.kind === 'event') {
    return <LaunchPartyMarker marker={marker} />;
  }

  return (
    <span className="pointer-events-none relative flex h-[88px] w-[103px] items-start justify-center overflow-visible">
      <span className="relative flex h-20 w-[103px] items-center justify-center">
        {marker.npcGhostDemo ? (
          <span
            aria-hidden="true"
            className="absolute h-[5.625rem] w-[5.625rem] rounded-full border border-[#0BA8FF]/70 bg-[#0BA8FF]/10 shadow-[0_0_28px_rgba(11,168,255,0.42)]"
            data-testid={`marker-npc-ghost-halo-${marker.id}`}
          />
        ) : null}
        <MarkerHeart marker={marker} isCurrentUser={isCurrentUser} />
        <MarkerBadge marker={marker} isCurrentUser={isCurrentUser} />
        <MarkerRelationshipBadge marker={marker} />
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
  onMarkerInteraction: () => void,
) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser;
  const isInteractive = !isCurrentUser || marker.kind === 'event' || marker.kind === 'cluster';
  const element = document.createElement(isInteractive ? 'button' : 'div');
  const name = getDisplayName(marker);
  const animationHint = marker.animationHint ?? 'NONE';

  element.className = [
    'relative flex h-[88px] w-[103px] items-start justify-center overflow-visible border-0 bg-transparent p-0 transition-opacity duration-700',
    animationHint === 'FADE_LAST_MINUTE' ? 'opacity-45' : '',
    animationHint === 'SIGNAL_LOSS' ? 'opacity-15 animate-pulse' : '',
    animationHint === 'REAPPEAR' ? 'opacity-100' : '',
  ].filter(Boolean).join(' ');
  element.dataset.animationHint = animationHint;
  element.dataset.displayMode = marker.displayMode ?? 'PRECISE';
  element.dataset.mapMarkerPin = 'true';
  element.dataset.mapMarkerKind = marker.kind ?? 'person';

  if (!isInteractive) {
    element.setAttribute('aria-label', 'Your approximate area');
  } else {
    const button = element as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-label', marker.kind === 'event'
      ? `Open ${marker.event?.venueName ?? name} launch party on map`
      : marker.kind === 'cluster'
      ? `Open ${marker.cluster?.label ?? name} on map`
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
    root.render(<MapMarkerPin marker={marker} />);
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
  const onPinClickRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);
  const onMapReadyRef = useRef(onMapReady);
  const lastMarkerInteractionAtRef = useRef(0);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [mapLoadStatus, setMapLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapError, setMapError] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const mapStyle = useMemo(() => getMapStyle(), []);
  const renderedMarkerResult = useMemo(
    () => applyDenseVenueMarkers(markers, denseVenue, currentZoom),
    [currentZoom, denseVenue, markers],
  );
  const renderedMarkers = renderedMarkerResult.markers;
  const focusLatitude = focusCoordinates?.approximateLatitude ?? null;
  const focusLongitude = focusCoordinates?.approximateLongitude ?? null;
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
    const shouldFallbackToRaster = canFallbackToDefaultRasterStyle(mapStyle);

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
          zoom: DEFAULT_ZOOM,
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

          onMapClickRef.current?.();
        });
        map.on('zoomend', () => {
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
        startMap(mapStyle);
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
  }, [mapStyle]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!map || focusLatitude == null || focusLongitude == null) {
      return;
    }

    const visibleMarkers = viewportMarkersRef.current;
    const focusKey = `${focusLatitude.toFixed(6)}:${focusLongitude.toFixed(6)}`;

    if (fitToMarkers) {
      if (autoFitFocusKeyRef.current !== focusKey) {
        autoFitFocusKeyRef.current = focusKey;
        hasAppliedAutoFitRef.current = false;
      } else if (hasAppliedAutoFitRef.current) {
        return;
      }
    } else {
      autoFitFocusKeyRef.current = null;
      hasAppliedAutoFitRef.current = false;
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
          maxZoom: FOCUSED_ZOOM,
          duration: 500,
        }
      );
      hasAppliedAutoFitRef.current = true;
      return;
    }

    map.setCenter([focusLongitude, focusLatitude]);
    map.setZoom(FOCUSED_ZOOM);
  }, [fitToMarkers, focusLatitude, focusLongitude, mapInstance, viewportMarkerSignature]);

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
    const maplibregl = mapLibreRef.current;

    if (!map || !maplibregl) {
      return;
    }

    markersRef.current.forEach(cleanupRenderedMarker);
    markersRef.current = [];

    const visibleMarkers = renderedMarkers.filter(isMapMarker);
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      markersRef.current = visibleMarkers.map((marker) => {
        const { element, root } = createMarkerElement(
          marker,
          (selectedMarker) => onPinClickRef.current(selectedMarker),
          () => {
            lastMarkerInteractionAtRef.current = Date.now();
          },
        );
        const mapMarker = new maplibregl.Marker({ element })
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
  }, [renderedMarkers, mapInstance]);

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
