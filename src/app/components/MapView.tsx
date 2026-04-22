import { useEffect, useRef, useState, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapViewProps {
  onPinClick: (user: any) => void;
  users: any[];
  onMapLoad?: (map: maplibregl.Map) => void;
  mapInstance?: any;
  userLocation?: { lat: number; lng: number } | null;
}

function MapView({ onPinClick, users, onMapLoad, mapInstance, userLocation }: MapViewProps) {
  // Maplibre network error UI state (must be at top of component)
  const [mapError, setMapError] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: any) => setMapError(e.detail || 'Map network error');
    window.addEventListener('maplibre-network-error', handler);
    return () => window.removeEventListener('maplibre-network-error', handler);
  }, []);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onPinClickRef = useRef(onPinClick);
  const onMapLoadRef = useRef(onMapLoad);

  // Log users for debugging and warn on invalid
  useEffect(() => {
    console.log('Fetched users:', users);
    if (Array.isArray(users)) {
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

        // Defensive: catch tile load errors and aborts
        map.current.on('error', (e: any) => {
          if (e && e.error && e.error.name === 'AbortError') {
            // Ignore fetch aborts, but log for debugging
            console.info('Map tile fetch aborted:', e.error);
          } else if (e && e.error && e.error.message && e.error.message.includes('Failed to fetch')) {
            // Network error, show a UI message if needed
            window.dispatchEvent(new CustomEvent('maplibre-network-error', { detail: e.error.message }));
            console.error('Map tile fetch failed:', e.error);
          } else {
            console.error('Map error:', e);
          }
        });

        return () => {
          markers.current.forEach((marker) => marker.remove());
          markers.current = [];
          map.current?.remove();
          map.current = null;
        };
      }, []);
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

      // Add new markers, only for users with valid lat/lng/id
      users.forEach((user) => {
        if (!map.current) return;
        if (
          typeof user !== 'object' ||
          user == null ||
          typeof user.lat !== 'number' ||
          typeof user.lng !== 'number' ||
          !user.id
        ) {
          // Defensive: skip invalid user
          return;
        }

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
      {(!users || users.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground z-10">
          No users found.
        </div>
      )}
      <div
        ref={mapContainer}
        className="w-full h-full"
        style={{ minHeight: '100%' }}
        suppressHydrationWarning
      />
      {/* Geolocation error fallback */}
      {userLocation === null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded z-30 text-xs">
          Location unavailable. Please enable location services for best experience.
        </div>
      )}
      {/* Maplibre network error fallback */}
      {mapError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-900/90 text-white px-4 py-2 rounded z-40 text-xs shadow-lg">
          Map failed to load tiles. Check your internet connection.<br />
          <span className="text-xs opacity-80">{mapError}</span>
        </div>
      )}
    </div>
  );
}

const MemoizedMapView = memo(MapView, areUsersEqual);

export default MemoizedMapView;
// Place this at the top level, before MapView
function areUsersEqual(prevProps, nextProps) {
  return prevProps.users === nextProps.users;
}
