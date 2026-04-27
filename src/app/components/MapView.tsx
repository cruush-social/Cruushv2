import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { Icon, LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

interface MapViewProps {
  onPinClick: (user: any) => void;
  users: any[];
  userLocation?: { lat: number; lng: number } | null;
}

// Custom hook to center map on user
function CenterMapOnUser({ userLocation }: { userLocation: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 14, { animate: true });
    }
  }, [userLocation, map]);
  return null;
}

const userIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconSize: [32, 48],
  iconAnchor: [16, 48],
  popupAnchor: [0, -48],
  className: 'leaflet-user-marker',
});

const otherIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
  className: 'leaflet-other-marker',
});

function MapView({ onPinClick, users, userLocation }: MapViewProps) {
  // Center on user or fallback
  const center: LatLngExpression = userLocation ? [userLocation.lat, userLocation.lng] : [40.7128, -74.006];

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: '100%', width: '100%', minHeight: 400, borderRadius: 12 }}
      scrollWheelZoom={true}
      dragging={true}
      doubleClickZoom={true}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution={"&copy; <a href='https://carto.com/attributions'>CARTO</a>"}
      />
      <CenterMapOnUser userLocation={userLocation || null} />
      {/* User pin */}
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng] as LatLngExpression} icon={userIcon as Icon}>
          <Popup>You are here</Popup>
        </Marker>
      )}
      {/* Other users */}
      {users && users.filter(u => u.lat && u.lng && u.id !== 'me').map((user) => (
        <Marker
          key={user.id}
          position={[user.lat, user.lng] as LatLngExpression}
          icon={otherIcon as Icon}
          eventHandlers={{ click: () => onPinClick(user) }}
        >
          <Popup>{user.display_name || 'User'}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default MapView;
