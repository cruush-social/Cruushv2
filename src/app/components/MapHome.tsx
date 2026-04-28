// Vite env type declaration for TypeScript
/// <reference types="vite/client" />
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { Map as LeafletMap } from 'leaflet';
import { Filter, Bell, Shield, Sparkles, Settings as SettingsIcon, ZoomIn, ZoomOut, Heart } from 'lucide-react';
import { Button } from './ui/button';
import { useIsMobile } from './ui/use-mobile';
import HeartPhoto from './HeartPhoto';
import MapView from './MapView';
import MapProfilePopup from './MapProfilePopup';
import { buildFallbackNearbyUsers, getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';

function getLastActiveMinutes(lastActive: string) {
  const value = parseInt(lastActive, 10);

  if (Number.isNaN(value)) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (lastActive.includes('d')) {
    return value * 1440;
  }

  if (lastActive.includes('h')) {
    return value * 60;
  }

  return value;
}

export default function MapHome() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingPreviewData, setUsingPreviewData] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DiscoveryUser | null>(null);

  const openProfile = (user: DiscoveryUser) => {
    navigate(`/profile/${user.id}`);
  };

  const handleUserSelect = (user: DiscoveryUser) => {
    if (isMobile) {
      openProfile(user);
      return;
    }

    setSelectedUser(user);
  };

  useEffect(() => {
    if (isMobile && selectedUser) {
      setSelectedUser(null);
    }
  }, [isMobile, selectedUser]);

  useEffect(() => {
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => setUserLocation(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
      );
    }
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    void fetchUsers(userLocation);
  }, [userLocation]);

  const fetchUsers = async (coordinates: { lat: number; lng: number } | null) => {
    setError(null);
    try {
      setUsers(await getNearbyUsers(coordinates));
      setUsingPreviewData(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers(buildFallbackNearbyUsers(coordinates));
      setUsingPreviewData(true);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  // Merge userLocation as a special pin
  const mergedUsers = userLocation
    ? [
        ...users,
        {
          id: 'me',
          name: 'You',
          display_name: 'You',
          lat: userLocation.lat,
          lng: userLocation.lng,
          photo: null,
          isCurrentUser: true,
          lastActive: '',
          distance: '',
        },
      ]
    : users;

  return (
    <div className="h-screen relative">
      <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/95 via-background/72 to-transparent px-4 pb-8 pt-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h1
            className="text-3xl tracking-tight"
            style={{
              fontFamily: 'UnifrakturMaguntia, serif',
              background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            cruush
          </h1>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/lucky')}
              title="I'm Feeling Lucky"
            >
              <Sparkles className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/safety')}
              title="Safety Center"
            >
              <Shield className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" title="Notifications">
              <Bell className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings')}
              title="Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute inset-0">
        <MapView
          onPinClick={handleUserSelect}
          onMapClick={() => setSelectedUser(null)}
          users={mergedUsers}
          userLocation={userLocation}
          onMapReady={setMapInstance}
        />

        {error ? (
          <div className="absolute left-4 right-20 top-24 z-20 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {usingPreviewData ? (
          <div className="absolute left-4 right-20 top-24 z-20 rounded-md border border-primary/30 bg-background/90 p-3 text-sm text-muted-foreground backdrop-blur-sm">
            Previewing nearby people while live discovery reconnects.
          </div>
        ) : null}

        {loading ? (
          <div className="absolute inset-x-4 top-28 z-20 rounded-md bg-card/90 p-3 text-sm text-muted-foreground backdrop-blur-sm">
            Loading nearby people...
          </div>
        ) : null}

        {!isMobile && selectedUser ? (
          <MapProfilePopup
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        ) : null}

        <div className="absolute right-4 top-24 z-20 flex flex-col gap-2">
          <Button
            style={{
              background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
            }}
            onClick={() => navigate('/filters')}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>

          <div className="flex flex-col gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => mapInstance?.zoomIn()}
              disabled={!mapInstance}
              className="bg-card/90 backdrop-blur-sm"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              onClick={() => mapInstance?.zoomOut()}
              disabled={!mapInstance}
              className="bg-card/90 backdrop-blur-sm"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {users.length > 0 && (
          <div className="absolute bottom-20 left-0 right-0 z-20 pb-2">
            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground">Recently Active</p>
            </div>
            <div className="flex gap-3 overflow-x-auto px-4 scrollbar-hide">
              {users
                .sort((a, b) => {
                  const aMinutes = getLastActiveMinutes(a.lastActive);
                  const bMinutes = getLastActiveMinutes(b.lastActive);
                  return aMinutes - bMinutes;
                })
                .slice(0, 10)
                .map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className="flex-shrink-0 w-20"
                  >
                    <div className="relative">
                      <HeartPhoto
                        className="w-20"
                        label={`${user.name} preview`}
                        photo={user.photo}
                        fallback={<Heart className="w-8 h-8 text-white/20" />}
                      />
                      <div className="absolute top-1 left-1 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-mono text-white/90">
                        {user.lastActive}
                      </div>
                    </div>
                    <p className="text-xs mt-1 truncate">{user.name}</p>
                    <p className="text-[10px] text-muted-foreground">{user.distance}</p>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
