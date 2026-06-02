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
  Bed,
  CircleDot,
  Crown,
  HandHeart,
  HeartHandshake,
  MessageCircle,
  MinusCircle,
  Mountain,
  MoveHorizontal,
  RefreshCw,
  Repeat2,
  type LucideIcon,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MapMarkerBadge = {
  kind: 'position';
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
const MAP_LABEL_FONT_FAMILY = 'Cormorant Garamond';
const MAP_LABEL_FONT_REGULAR = ['Cormorant Garamond'];
const MAP_LABEL_FONT_BOLD = ['Cormorant Garamond Bold', 'Cormorant Garamond'];

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

const HEART_PATH =
  'M32 56C30.55 54.67 8 39.75 8 23.75C8 14.95 13.95 8 22 8C27.05 8 30.2 10.78 32 14.05C33.8 10.78 36.95 8 42 8C50.05 8 56 14.95 56 23.75C56 39.75 33.45 54.67 32 56Z';

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
  'vers bottom': Repeat2,
  'vers top': Repeat2,
  none: MinusCircle,
  'stone top': Mountain,
  'pillow princess': Bed,
  gooner: CircleDot,
};

const POSITION_BADGE_ALIASES: Record<string, string> = {
  vers: 'versatile',
};

function normalizeBadgeValue(value: string) {
  const normalizedValue = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return POSITION_BADGE_ALIASES[normalizedValue] ?? normalizedValue;
}

function findKnownBadgeValue(values: string[] | undefined) {
  return values
    ?.map(normalizeBadgeValue)
    .find((value) => Boolean(POSITION_BADGE_ICONS[value]));
}

export function createMapMarkerBadge(positionValues: string[] = [], _hostingTravelValues: string[] = []) {
  const positionValue = findKnownBadgeValue(positionValues);

  if (positionValue) {
    return {
      kind: 'position',
      label: positionValue,
      iconName: positionValue,
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

  return POSITION_BADGE_ICONS[badge.iconName] ?? null;
}

function MarkerBadge({ badge, isCurrentUser, markerId }: { badge?: MapMarkerBadge | null; isCurrentUser: boolean; markerId: string }) {
  const Icon = getBadgeIcon(badge);

  if (!badge || !Icon) {
    return null;
  }

  return (
    <span
      aria-label={badge.label}
      className={[
        'absolute right-2 top-9 flex h-5 w-5 items-center justify-center rounded-full border bg-black/85 text-white shadow-[0_4px_14px_rgba(0,0,0,0.55)] backdrop-blur-sm',
        isCurrentUser ? 'border-[#0BA8FF]/80' : 'border-[#FF0072]/80',
      ].join(' ')}
      data-testid={`marker-badge-${markerId}`}
      role="img"
      title={badge.label}
    >
      <Icon aria-hidden="true" className="h-3 w-3" strokeWidth={2.6} />
    </span>
  );
}

function MarkerHeart({ marker, isCurrentUser }: { marker: MapMarker; isCurrentUser: boolean }) {
  const hasPhoto = Boolean(marker.photo);
  const gradientId = `marker-fill-${marker.id}`;
  const clipId = `marker-photo-clip-${marker.id}`;
  const borderColor = isCurrentUser ? '#0BA8FF' : '#FF0072';

  return (
    <svg
      aria-hidden="true"
      className="h-20 w-20"
      data-testid={`marker-heart-${marker.id}`}
      data-has-photo={hasPhoto ? 'true' : 'false'}
      data-marker-theme={isCurrentUser ? 'current' : 'nearby'}
      height="80"
      viewBox="0 0 64 64"
      width="80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" x2="55" y1="9" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={isCurrentUser ? '#00B8FF' : '#FF0072'} />
          <stop offset="52%" stopColor={isCurrentUser ? '#0A7DF4' : '#E00062'} />
          <stop offset="100%" stopColor={isCurrentUser ? '#3236D4' : '#B00045'} />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={HEART_PATH} />
        </clipPath>
      </defs>
      {hasPhoto ? (
        <>
          <image
            clipPath={`url(#${clipId})`}
            data-testid={`marker-photo-fill-${marker.id}`}
            height="64"
            href={marker.photo ?? ''}
            preserveAspectRatio="xMidYMid slice"
            width="64"
          />
          <path d={HEART_PATH} fill="none" stroke={borderColor} strokeWidth="3.2" />
        </>
      ) : (
        <path d={HEART_PATH} fill={`url(#${gradientId})`} />
      )}
    </svg>
  );
}

function MapMarkerPin({ marker }: { marker: MapMarker }) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser === true;

  return (
    <span className="pointer-events-none relative flex h-[88px] w-[103px] items-start justify-center overflow-visible">
      <span className="relative flex h-20 w-[103px] items-center justify-center">
        <MarkerHeart marker={marker} isCurrentUser={isCurrentUser} />
        <MarkerBadge badge={marker.badge} isCurrentUser={isCurrentUser} markerId={marker.id} />
      </span>
    </span>
  );
}

function createMarkerElement(marker: MapMarker, onPinClick: (marker: MapMarker) => void) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser;
  const element = document.createElement(isCurrentUser ? 'div' : 'button');
  const name = getDisplayName(marker);

  element.className = 'relative flex h-[88px] w-[103px] items-start justify-center overflow-visible border-0 bg-transparent p-0';

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
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
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

    let isMounted = true;

    const initializeMap = async () => {
      await loadMapLabelFonts();

      if (!isMounted || !containerRef.current || mapRef.current) {
        return;
      }

      try {
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: mapStyle,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: MIN_DISCOVERY_ZOOM,
          maxBounds: NYC_METRO_MAX_BOUNDS,
          renderWorldCopies: false,
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
        setMapInstance(map);
        onMapReady?.(map);
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
  }, [mapStyle, onMapReady]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

    if (!map || !focusCoordinates) {
      return;
    }

    map.setCenter([focusCoordinates.approximateLongitude, focusCoordinates.approximateLatitude]);
    map.setZoom(FOCUSED_ZOOM);
  }, [focusCoordinates, mapInstance]);

  useEffect(() => {
    const map = mapInstance ?? mapRef.current;

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
  }, [markers, mapInstance]);

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
