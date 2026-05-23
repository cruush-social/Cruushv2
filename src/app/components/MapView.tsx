import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import maplibregl, {
  type LngLatLike,
  type Map as MapLibreMap,
  type Marker as MapLibreMarker,
  type StyleSpecification,
} from 'maplibre-gl';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Bed,
  Car,
  CircleDot,
  CircleHelp,
  Crown,
  HandHeart,
  HeartHandshake,
  Home,
  Hotel,
  MessageCircle,
  MinusCircle,
  Mountain,
  MoveHorizontal,
  RefreshCw,
  Repeat2,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MapMarkerBadge = {
  kind: 'self' | 'position' | 'hostingTravel';
  label: string;
  iconName?: string;
};

export type MapMarker = {
  id: string;
  displayName: string;
  approximateLatitude: number;
  approximateLongitude: number;
  lastActiveLabel?: string;
  photo?: string | null;
  isCurrentUser?: boolean;
  badge?: MapMarkerBadge | null;
};

interface MapViewProps {
  onPinClick: (marker: MapMarker) => void;
  onMapClick?: () => void;
  onMapReady?: (map: MapLibreMap) => void;
  markers: MapMarker[];
  focusCoordinates?: {
    approximateLatitude: number;
    approximateLongitude: number;
  } | null;
}

const DEFAULT_CENTER: LngLatLike = [-74.006, 40.7128];
const DEFAULT_ZOOM = 12;
const FOCUSED_ZOOM = 14;
const DEFAULT_TILE_URLS = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];
const DEFAULT_ATTRIBUTION = '&copy; CARTO &copy; OpenStreetMap contributors';
const DEFAULT_VECTOR_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const DEFAULT_GLYPHS_URL = 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf';
const MAP_LABEL_FONT_REGULAR = ['Cormorant Garamond Regular'];
const MAP_LABEL_FONT_BOLD = ['Cormorant Garamond Bold'];

function createRasterStyle(tileUrls: string[], attribution: string): StyleSpecification {
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

export function createCruushVectorStyle(
  tileJsonUrl = DEFAULT_VECTOR_TILEJSON_URL,
  glyphsUrl = DEFAULT_GLYPHS_URL,
): StyleSpecification {
  return {
    version: 8,
    glyphs: glyphsUrl,
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
        id: 'building-fill',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            '#161616',
            16,
            '#181818',
          ],
          'fill-opacity': 0.88,
        },
      },
      {
        id: 'building-outline',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 15,
        paint: {
          'line-color': '#1e1e1e',
          'line-width': 0.6,
          'line-opacity': 0.7,
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
        id: 'poi-dots',
        type: 'circle',
        source: 'openmaptiles',
        'source-layer': 'poi',
        minzoom: 14,
        paint: {
          'circle-color': '#0d0d0d',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2.5, 17, 4],
          'circle-stroke-color': '#383838',
          'circle-stroke-width': 1,
          'circle-opacity': 0.8,
        },
      },
      {
        id: 'minor-road-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 15,
        filter: [
          'match',
          ['get', 'class'],
          ['minor', 'service'],
          true,
          false,
        ],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': MAP_LABEL_FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 17, 12],
          'text-transform': 'uppercase',
          'text-padding': 2,
        },
        paint: {
          'text-color': '#505050',
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
          'text-transform': 'uppercase',
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
          'text-transform': 'uppercase',
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
          'text-transform': 'uppercase',
          'text-padding': 2,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#080808',
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'poi-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'poi',
        minzoom: 14,
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': MAP_LABEL_FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 12],
          'text-transform': 'uppercase',
          'text-offset': [0, 0.75],
          'text-anchor': 'top',
          'text-padding': 2,
        },
        paint: {
          'text-color': '#c0c0c0',
          'text-halo-color': '#0d0d0d',
          'text-halo-width': 1.4,
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
          'text-transform': 'uppercase',
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
    configuredGlyphsUrl || DEFAULT_GLYPHS_URL,
  );
}

const HEART_PATH =
  'M35.2 54.4C35.2 54.4 16 40 16 28C16 20.8 20.8 16 25.6 16C30.4 16 35.2 20.8 35.2 20.8C35.2 20.8 40 16 44.8 16C49.6 16 54.4 20.8 54.4 28C54.4 40 35.2 54.4 35.2 54.4Z';

const POSITION_BADGE_ICONS: Record<string, LucideIcon> = {
  top: ArrowUp,
  bottom: ArrowDown,
  versatile: Repeat2,
  switch: RefreshCw,
  dominant: Crown,
  submissive: HandHeart,
  side: MoveHorizontal,
  oral: MessageCircle,
  service: HeartHandshake,
  none: MinusCircle,
  'stone top': Mountain,
  'pillow princess': Bed,
  gooner: CircleDot,
};

const HOSTING_TRAVEL_BADGE_ICONS: Record<string, LucideIcon> = {
  'can host': Home,
  'cant host': Ban,
  car: Car,
  hotel: Hotel,
  outdoors: Trees,
  'ask me': CircleHelp,
};

function normalizeBadgeValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace("can't", 'cant');
}

function findKnownBadgeValue(values: string[] | undefined, knownValues: Record<string, LucideIcon>) {
  return values
    ?.map(normalizeBadgeValue)
    .find((value) => Boolean(knownValues[value]));
}

export function createMapMarkerBadge(positionValues: string[] = [], hostingTravelValues: string[] = []) {
  const positionValue = findKnownBadgeValue(positionValues, POSITION_BADGE_ICONS);

  if (positionValue) {
    return {
      kind: 'position',
      label: positionValue,
      iconName: positionValue,
    } satisfies MapMarkerBadge;
  }

  const hostingTravelValue = findKnownBadgeValue(hostingTravelValues, HOSTING_TRAVEL_BADGE_ICONS);

  if (hostingTravelValue) {
    return {
      kind: 'hostingTravel',
      label: hostingTravelValue,
      iconName: hostingTravelValue,
    } satisfies MapMarkerBadge;
  }

  return null;
}

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

function getBadgeIcon(badge: MapMarkerBadge | null | undefined) {
  if (!badge?.iconName) {
    return null;
  }

  if (badge.kind === 'position') {
    return POSITION_BADGE_ICONS[badge.iconName] ?? null;
  }

  if (badge.kind === 'hostingTravel') {
    return HOSTING_TRAVEL_BADGE_ICONS[badge.iconName] ?? null;
  }

  return null;
}

function MarkerBadge({ badge, isCurrentUser, markerId }: { badge?: MapMarkerBadge | null; isCurrentUser: boolean; markerId: string }) {
  if (isCurrentUser) {
    return (
      <span
        className="absolute right-0 top-5 rounded-full border border-[#22B8FF]/70 bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-[0.12em] text-[#C7F0FF] shadow-[0_0_14px_rgba(34,184,255,0.7)] backdrop-blur-sm"
        data-testid={`marker-badge-${markerId}`}
      >
        YOU
      </span>
    );
  }

  const Icon = getBadgeIcon(badge);

  if (!badge || !Icon) {
    return null;
  }

  return (
    <span
      aria-label={badge.label}
      className="absolute right-0 top-5 flex h-6 w-6 items-center justify-center rounded-full border border-[#FF4A6A]/70 bg-black/75 text-white shadow-[0_0_14px_rgba(209,31,58,0.65)] backdrop-blur-sm"
      data-testid={`marker-badge-${markerId}`}
      role="img"
      title={badge.label}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.4} />
    </span>
  );
}

function MarkerHeart({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  const hasPhoto = Boolean(marker.photo);
  const gradientId = `marker-fill-${marker.id}`;
  const clipId = `marker-photo-clip-${marker.id}`;
  const filterId = `marker-shadow-${marker.id}`;
  const borderColor = isCurrentUser ? '#22B8FF' : '#D11F3A';
  const shadowMatrix = isCurrentUser
    ? '0 0 0 0 0.133333 0 0 0 0 0.721569 0 0 0 0 1 0 0 0 1 0'
    : '0 0 0 0 0.819608 0 0 0 0 0.121569 0 0 0 0 0.227451 0 0 0 0.72 0';

  return (
    <svg
      aria-hidden="true"
      className="h-14 w-14"
      data-testid={`marker-heart-${marker.id}`}
      data-has-photo={hasPhoto ? 'true' : 'false'}
      data-marker-theme={isCurrentUser ? 'current' : 'nearby'}
      height="71"
      viewBox="0 0 71 71"
      width="71"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="16" x2="54.4" y1="16" y2="54.4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={isCurrentUser ? '#0099FF' : '#FF0072'} />
          <stop offset="48.5577%" stopColor={isCurrentUser ? '#1968EA' : '#DA045D'} />
          <stop offset="100%" stopColor={isCurrentUser ? '#3236D4' : '#B40849'} />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={HEART_PATH} />
        </clipPath>
        <filter id={filterId} x="-4.8" y="-4.8" width="80" height="80" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset />
          <feGaussianBlur stdDeviation="8" />
          <feColorMatrix type="matrix" values={shadowMatrix} />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        {hasPhoto ? (
          <>
            <image
              clipPath={`url(#${clipId})`}
              data-testid={`marker-photo-fill-${marker.id}`}
              height="71"
              href={marker.photo ?? ''}
              preserveAspectRatio="xMidYMid slice"
              width="71"
            />
            <path d={HEART_PATH} fill="none" stroke={borderColor} strokeWidth="3.2" />
          </>
        ) : (
          <path d={HEART_PATH} fill={`url(#${gradientId})`} stroke={borderColor} strokeWidth="1.8" />
        )}
        <circle cx="35.2" cy="24.8" r={isCurrentUser ? '4.5' : '3.5'} fill="#ffffff" fillOpacity={isCurrentUser ? '0.95' : '0.82'} />
      </g>
    </svg>
  );
}

function MapMarkerPin({ marker }: { marker: MapMarker }) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser;
  const markerBadge = isCurrentUser ? { kind: 'self', label: 'YOU' } satisfies MapMarkerBadge : marker.badge;

  return (
    <span className="pointer-events-none relative flex h-[76px] w-[82px] flex-col items-center overflow-visible">
      <span className="relative flex h-14 w-[82px] items-center justify-center">
        <MarkerHeart marker={marker} isCurrentUser={isCurrentUser} />
        <MarkerBadge badge={markerBadge} isCurrentUser={isCurrentUser} markerId={marker.id} />
      </span>
      {marker.lastActiveLabel ? (
        <span className="mt-0.5 max-w-[76px] truncate rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-white/78 shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          {marker.lastActiveLabel}
        </span>
      ) : null}
    </span>
  );
}

function createMarkerElement(marker: MapMarker, onPinClick: (marker: MapMarker) => void) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser;
  const element = document.createElement(isCurrentUser ? 'div' : 'button');
  const name = getDisplayName(marker);

  element.className = [
    'relative flex h-[76px] w-[82px] items-start justify-center overflow-visible border-0 bg-transparent p-0',
    isCurrentUser
      ? 'drop-shadow-[0_0_16px_#22B8FF]'
      : 'drop-shadow-[0_0_16px_rgba(209,31,58,0.60)] transition-transform hover:scale-110',
  ].join(' ');

  if (isCurrentUser) {
    element.setAttribute('aria-label', 'Your approximate area');
  } else {
    const button = element as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-label', `Open ${name} on map`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onPinClick(marker);
    });
  }

  const root = createRoot(element);
  root.render(<MapMarkerPin marker={marker} />);

  return { element, root };
}

export type CruushMapInstance = MapLibreMap;

function cleanupRenderedMarker({ marker, root }: RenderedMapMarker) {
  marker.remove();
  queueMicrotask(() => root.unmount());
}

function MapView({ onPinClick, onMapClick, onMapReady, markers, focusCoordinates }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<RenderedMapMarker[]>([]);
  const onPinClickRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);
  const [mapLoadStatus, setMapLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapError, setMapError] = useState<string | null>(null);
  const mapStyle = useMemo(() => getMapStyle(), []);

  useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: mapStyle,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });

      map.on('click', () => onMapClickRef.current?.());
      map.on('load', () => {
        setMapLoadStatus('ready');
        setMapError(null);
      });
      map.on('error', () => {
        setMapLoadStatus('error');
        setMapError('Map tiles could not load. Check the map style or tile URL configuration.');
      });
      mapRef.current = map;
      onMapReady?.(map);
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapLoadStatus('error');
      setMapError('Map could not start. Check the map style or tile URL configuration.');
    }

    return () => {
      markersRef.current.forEach(cleanupRenderedMarker);
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapStyle, onMapReady]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !focusCoordinates) {
      return;
    }

    map.setCenter([focusCoordinates.approximateLongitude, focusCoordinates.approximateLatitude]);
    map.setZoom(FOCUSED_ZOOM);
  }, [focusCoordinates]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    markersRef.current.forEach(cleanupRenderedMarker);
    markersRef.current = [];

    const visibleMarkers = markers.filter(isMapMarker);

    markersRef.current = visibleMarkers.map((marker) => {
      const { element, root } = createMarkerElement(marker, (selectedMarker) => onPinClickRef.current(selectedMarker));
      const mapMarker = new maplibregl.Marker({ element })
        .setLngLat([marker.approximateLongitude, marker.approximateLatitude])
        .addTo(map);
      return {
        marker: mapMarker,
        root,
      };
    });
  }, [markers]);

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
