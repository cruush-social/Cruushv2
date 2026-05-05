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
  'M22 39.5C14.4 33.1 5 25.2 5 15.4C5 9.7 9.3 5.5 14.6 5.5C17.7 5.5 20.5 7 22 9.5C23.5 7 26.3 5.5 29.4 5.5C34.7 5.5 39 9.7 39 15.4C39 25.2 29.6 33.1 22 39.5Z';

function isMapUser(value: MapUser) {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng);
}

function getDisplayName(user: MapUser) {
  return user.name?.trim() || user.display_name?.trim() || 'person';
}

function createMarkerElement(user: MapUser, onPinClick: (user: MapUser) => void) {
  const isCurrentUser = user.id === 'me' || user.isCurrentUser;
  const element = document.createElement(isCurrentUser ? 'div' : 'button');
  const name = getDisplayName(user);

  element.className = [
    'relative flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0',
    isCurrentUser
      ? 'drop-shadow-[0_0_14px_rgba(0,75,255,0.7)]'
      : 'drop-shadow-[0_0_16px_rgba(255,7,114,0.55)] transition-transform hover:scale-110',
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
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('h-11', 'w-11');

  const heart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  heart.setAttribute('d', HEART_PATH);
  heart.setAttribute('fill', isCurrentUser ? '#004bff' : '#d11f3a');
  heart.setAttribute('stroke', '#ffffff');
  heart.setAttribute('stroke-width', '2');

  const spark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  spark.setAttribute('cx', '22');
  spark.setAttribute('cy', '18');
  spark.setAttribute('r', isCurrentUser ? '4.5' : '3.5');
  spark.setAttribute('fill', '#ffffff');
  spark.setAttribute('fill-opacity', isCurrentUser ? '0.95' : '0.82');

  svg.append(heart, spark);
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
