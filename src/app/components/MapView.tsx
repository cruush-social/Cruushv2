import { useEffect, useRef, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapViewProps {
  onPinClick: (user: any) => void;
  users: any[];
  onMapLoad?: (map: maplibregl.Map) => void;
}

function MapView({ onPinClick, users, onMapLoad }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onPinClickRef = useRef(onPinClick);
  const onMapLoadRef = useRef(onMapLoad);

  // Update refs when callbacks change
  useEffect(() => {
    onPinClickRef.current = onPinClick;
    onMapLoadRef.current = onMapLoad;
  }, [onPinClick, onMapLoad]);

  const createHeartPinElement = (user: any) => {
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '56px';
    container.style.height = '56px';
    container.style.cursor = 'pointer';

    // Last active badge
    if (user.lastActive) {
      const badge = document.createElement('div');
      badge.style.position = 'absolute';
      badge.style.top = '-4px';
      badge.style.left = '-4px';
      badge.style.zIndex = '10';
      badge.style.padding = '2px 6px';
      badge.style.background = 'rgba(0, 0, 0, 0.9)';
      badge.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      badge.style.fontSize = '10px';
      badge.style.fontFamily = 'monospace';
      badge.style.color = 'rgba(255, 255, 255, 0.9)';
      badge.textContent = user.lastActive;
      container.appendChild(badge);
    }

    // SVG heart
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.filter = 'drop-shadow(0 0 8px rgba(209, 31, 58, 0.6))';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', `gradient-${user.id}`);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#d11f3a');

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '50%');
    stop2.setAttribute('stop-color', '#9f1730');

    const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop3.setAttribute('offset', '100%');
    stop3.setAttribute('stop-color', '#690f1f');

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    gradient.appendChild(stop3);
    defs.appendChild(gradient);
    svg.appendChild(defs);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M50,90 C50,90 10,60 10,35 C10,20 20,10 30,10 C40,10 50,20 50,20 C50,20 60,10 70,10 C80,10 90,20 90,35 C90,60 50,90 50,90 Z'
    );
    path.setAttribute('fill', `url(#gradient-${user.id})`);

    svg.appendChild(path);
    container.appendChild(svg);

    // Pulsing glow for users without photos
    if (!user.photo) {
      const glow = document.createElement('div');
      glow.style.position = 'absolute';
      glow.style.inset = '0';
      glow.style.background = 'radial-gradient(circle, rgba(209, 31, 58, 0.4), transparent)';
      glow.style.filter = 'blur(8px)';
      glow.style.animation = 'pulse 2s ease-in-out infinite';
      glow.style.pointerEvents = 'none';
      container.appendChild(glow);
    }

    return container;
  };

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      },
      center: [-122.4194, 37.7749],
      zoom: 13.5,
      attributionControl: false,
    });

    map.current.on('load', () => {
      if (!map.current) return;

      // Notify parent that map is loaded
      if (onMapLoadRef.current) {
        onMapLoadRef.current(map.current);
      }

      // Add dark overlay for cinematic effect
      map.current.addLayer({
        id: 'dark-overlay',
        type: 'background',
        paint: {
          'background-color': '#000000',
          'background-opacity': 0.85,
        },
      });
    });

    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers when users change
  useEffect(() => {
    if (!map.current) return;

    // Wait for map to be loaded
    const updateMarkers = () => {
      if (!map.current) return;

      // Clear existing markers
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];

      // Add new markers
      users.forEach((user) => {
        if (!map.current) return;

        const el = createHeartPinElement(user);

        el.addEventListener('click', () => {
          onPinClickRef.current(user);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([user.lng, user.lat])
          .addTo(map.current!);

        markers.current.push(marker);
      });
    };

    if (map.current.loaded()) {
      updateMarkers();
    } else {
      map.current.once('load', updateMarkers);
    }
  }, [users]);

  return (
    <div className="w-full h-full relative">
      <div
        ref={mapContainer}
        className="w-full h-full"
        style={{ minHeight: '100%' }}
        suppressHydrationWarning
      />
    </div>
  );
}

const MemoizedMapView = memo(MapView, (prevProps, nextProps) => {
  // Only re-render if users array reference changes
  return prevProps.users === nextProps.users;
});

export default MemoizedMapView;
