import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type LngLatLike,
  type Map as MapLibreMap,
  type Marker as MapLibreMarker,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MapMarker = {
  id: string;
  displayName: string;
  approximateLatitude: number;
  approximateLongitude: number;
  lastActiveLabel?: string;
  photo?: string | null;
  isCurrentUser?: boolean;
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
const DEFAULT_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

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
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 17, 12],
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
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
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
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 16, 15],
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
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 13, 16, 16],
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
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 12],
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
          'text-font': ['Noto Sans Bold'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            13,
            12,
            17,
          ],
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

function isMapMarker(value: MapMarker) {
  return Number.isFinite(value.approximateLatitude) && Number.isFinite(value.approximateLongitude);
}

function getDisplayName(marker: MapMarker) {
  return marker.displayName.trim() || 'person';
}

function createMarkerElement(marker: MapMarker, onPinClick: (marker: MapMarker) => void) {
  const isCurrentUser = marker.id === 'me' || marker.isCurrentUser;
  const hasPhoto = Boolean(marker.photo);
  const element = document.createElement(isCurrentUser ? 'div' : 'button');
  const name = getDisplayName(marker);

  element.className = [
    'relative flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0',
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

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', '71');
  svg.setAttribute('height', '71');
  svg.setAttribute('viewBox', '0 0 71 71');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('h-11', 'w-11');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  if (hasPhoto) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', `marker-photo-${marker.id}`);
    pattern.setAttribute('width', '1');
    pattern.setAttribute('height', '1');

    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', marker.photo ?? '');
    image.setAttribute('width', '71');
    image.setAttribute('height', '71');
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.appendChild(image);
    defs.appendChild(pattern);
  }

  const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradient.setAttribute('id', `marker-fill-${marker.id}`);
  gradient.setAttribute('x1', '16');
  gradient.setAttribute('y1', '16');
  gradient.setAttribute('x2', '54.4');
  gradient.setAttribute('y2', '54.4');
  gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', isCurrentUser ? '#0099FF' : '#FF0072');
  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop2.setAttribute('offset', '48.5577%');
  stop2.setAttribute('stop-color', isCurrentUser ? '#1968EA' : '#DA045D');
  const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop3.setAttribute('offset', '100%');
  stop3.setAttribute('stop-color', isCurrentUser ? '#3236D4' : '#B40849');
  gradient.append(stop1, stop2, stop3);
  defs.appendChild(gradient);

  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', `marker-shadow-${marker.id}`);
  filter.setAttribute('x', '-4.8');
  filter.setAttribute('y', '-4.8');
  filter.setAttribute('width', '80');
  filter.setAttribute('height', '80');
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood');
  flood.setAttribute('flood-opacity', '0');
  flood.setAttribute('result', 'BackgroundImageFix');
  const alpha = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
  alpha.setAttribute('in', 'SourceAlpha');
  alpha.setAttribute('type', 'matrix');
  alpha.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
  alpha.setAttribute('result', 'hardAlpha');
  const offset = document.createElementNS('http://www.w3.org/2000/svg', 'feOffset');
  const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '8');
  const color = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
  color.setAttribute('type', 'matrix');
  color.setAttribute(
    'values',
    isCurrentUser
      ? '0 0 0 0 0.133333 0 0 0 0 0.721569 0 0 0 0 1 0 0 0 1 0'
      : '0 0 0 0 0.819608 0 0 0 0 0.121569 0 0 0 0 0.227451 0 0 0 0.6 0',
  );
  const blend1 = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
  blend1.setAttribute('mode', 'normal');
  blend1.setAttribute('in2', 'BackgroundImageFix');
  blend1.setAttribute('result', 'effect1_dropShadow');
  const blend2 = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
  blend2.setAttribute('mode', 'normal');
  blend2.setAttribute('in', 'SourceGraphic');
  blend2.setAttribute('in2', 'effect1_dropShadow');
  blend2.setAttribute('result', 'shape');

  filter.append(flood, alpha, offset, blur, color, blend1, blend2);
  defs.appendChild(filter);

  const heartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  heartGroup.setAttribute('filter', `url(#marker-shadow-${marker.id})`);

  const heart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  heart.setAttribute('d', HEART_PATH);
  heart.setAttribute('fill', hasPhoto ? `url(#marker-photo-${marker.id})` : `url(#marker-fill-${marker.id})`);

  const spark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  spark.setAttribute('cx', '35.2');
  spark.setAttribute('cy', '24.8');
  spark.setAttribute('r', isCurrentUser ? '4.5' : '3.5');
  spark.setAttribute('fill', '#ffffff');
  spark.setAttribute('fill-opacity', isCurrentUser ? '0.95' : '0.82');

  heartGroup.append(heart, spark);
  svg.append(defs, heartGroup);
  element.appendChild(svg);

  return element;
}

export type CruushMapInstance = MapLibreMap;

function MapView({ onPinClick, onMapClick, onMapReady, markers, focusCoordinates }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
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
      markersRef.current.forEach((marker) => marker.remove());
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

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const visibleMarkers = markers.filter(isMapMarker);

    markersRef.current = visibleMarkers.map((marker) => {
      const element = createMarkerElement(marker, (selectedMarker) => onPinClickRef.current(selectedMarker));
      return new maplibregl.Marker({ element })
        .setLngLat([marker.approximateLongitude, marker.approximateLatitude])
        .addTo(map);
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
