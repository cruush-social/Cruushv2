import { useEffect, useRef } from 'react';
import maplibregl, {
  type LngLatLike,
  type Map as MapLibreMap,
  type Marker as MapLibreMarker,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type MapUser = {
  id: string;
  name?: string;
  display_name?: string;
  lat: number;
  lng: number;
  photo?: string | null;
  isCurrentUser?: boolean;
};

interface MapViewProps {
  onPinClick: (user: MapUser) => void;
  onMapClick?: () => void;
  onMapReady?: (map: MapLibreMap) => void;
  users: MapUser[];
  userLocation?: { lat: number; lng: number } | null;
}

const DEFAULT_CENTER: LngLatLike = [-74.006, 40.7128];
const DEFAULT_ZOOM = 14;

const rasterStyle = {
  version: 8,
  sources: {
    cartoDark: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; CARTO &copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'carto-dark',
      type: 'raster',
      source: 'cartoDark',
    },
  ],
} as const;

const HEART_PATH =
  'M35.2 54.4C35.2 54.4 16 40 16 28C16 20.8 20.8 16 25.6 16C30.4 16 35.2 20.8 35.2 20.8C35.2 20.8 40 16 44.8 16C49.6 16 54.4 20.8 54.4 28C54.4 40 35.2 54.4 35.2 54.4Z';

function isMapUser(value: MapUser) {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng);
}

function getDisplayName(user: MapUser) {
  return user.name?.trim() || user.display_name?.trim() || 'person';
}

function createMarkerElement(user: MapUser, onPinClick: (user: MapUser) => void) {
  const isCurrentUser = user.id === 'me' || user.isCurrentUser;
  const hasPhoto = Boolean(user.photo);
  const element = document.createElement(isCurrentUser ? 'div' : 'button');
  const name = getDisplayName(user);

  element.className = [
    'relative flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0',
    isCurrentUser
      ? 'drop-shadow-[0_0_16px_#22B8FF]'
      : 'drop-shadow-[0_0_16px_rgba(209,31,58,0.60)] transition-transform hover:scale-110',
  ].join(' ');

  if (isCurrentUser) {
    element.setAttribute('aria-label', 'Your current location');
  } else {
    const button = element as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-label', `Open ${name} on map`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onPinClick(user);
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
    pattern.setAttribute('id', `marker-photo-${user.id}`);
    pattern.setAttribute('width', '1');
    pattern.setAttribute('height', '1');

    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', user.photo ?? '');
    image.setAttribute('width', '71');
    image.setAttribute('height', '71');
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.appendChild(image);
    defs.appendChild(pattern);
  }

  const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradient.setAttribute('id', `marker-fill-${user.id}`);
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
  filter.setAttribute('id', `marker-shadow-${user.id}`);
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
  heartGroup.setAttribute('filter', `url(#marker-shadow-${user.id})`);

  const heart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  heart.setAttribute('d', HEART_PATH);
  heart.setAttribute('fill', hasPhoto ? `url(#marker-photo-${user.id})` : `url(#marker-fill-${user.id})`);

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

function MapView({ onPinClick, onMapClick, onMapReady, users, userLocation }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const onPinClickRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);

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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: rasterStyle,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    map.on('click', () => onMapClickRef.current?.());
    mapRef.current = map;
    onMapReady?.(map);

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [onMapReady]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !userLocation) {
      return;
    }

    map.setCenter([userLocation.lng, userLocation.lat]);
    map.setZoom(DEFAULT_ZOOM);
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const markerUsers = users.filter((user) => user.id !== 'me' && isMapUser(user));

    if (userLocation) {
      markerUsers.unshift({
        id: 'me',
        name: 'You',
        display_name: 'You',
        lat: userLocation.lat,
        lng: userLocation.lng,
        isCurrentUser: true,
      });
    }

    markersRef.current = markerUsers.map((user) => {
      const element = createMarkerElement(user, (selectedUser) => onPinClickRef.current(selectedUser));
      return new maplibregl.Marker({ element })
        .setLngLat([user.lng, user.lat])
        .addTo(map);
    });
  }, [users, userLocation]);

  return (
    <div
      ref={containerRef}
      className="cruush-map h-full min-h-[400px] w-full overflow-hidden bg-background"
      data-testid="maplibre-map"
    />
  );
}

export default MapView;
