// Vite env type declaration for TypeScript
/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { CruushMapInstance } from './MapView';
import { Filter, Bell, Shield, Sparkles, Settings as SettingsIcon, ZoomIn, ZoomOut, Heart } from 'lucide-react';
import { Button } from './ui/button';
import { useIsMobile } from './ui/use-mobile';
import HeartPhoto from './HeartPhoto';
import MapView from './MapView';
import MapProfilePopup from './MapProfilePopup';
import { syncMyLocation } from '../lib/locationApi';
import { getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';

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
  const [mapInstance, setMapInstance] = useState<CruushMapInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<DiscoveryUser | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const lastSyncedLocationKeyRef = useRef<string | null>(null);

  const openProfile = (user: DiscoveryUser) => {
    navigate(`/profile/${user.id}`, {
      state: {
        distance: user.distance,
        lastActive: user.lastActive,
      },
    });
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

  useEffect(() => {
    if (!userLocation) {
      return;
    }

    const locationKey = `${userLocation.lat.toFixed(4)}:${userLocation.lng.toFixed(4)}`;

    if (lastSyncedLocationKeyRef.current === locationKey) {
      return;
    }

    lastSyncedLocationKeyRef.current = locationKey;

    void syncMyLocation({
      lat: userLocation.lat,
      lng: userLocation.lng,
      fuzz_radius_meters: 0,
    }).catch((syncError) => {
      console.error('Error syncing location:', syncError);
    });
  }, [userLocation]);

  const fetchUsers = async (coordinates: { lat: number; lng: number } | null) => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await getNearbyUsers(coordinates));
    } catch (fetchError) {
      console.error('Error fetching users:', fetchError);
      setUsers([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load nearby people.');
    } finally {
      setLoading(false);
    }
  };

  const hasActiveFilters =
    filters.ageRange[0] !== DEFAULT_FILTER_STATE.ageRange[0] ||
    filters.ageRange[1] !== DEFAULT_FILTER_STATE.ageRange[1] ||
    filters.distance !== DEFAULT_FILTER_STATE.distance ||
    [
      filters.identities,
      filters.presentations,
      filters.lookingFor,
      filters.timing,
      filters.hosting,
      filters.vibes,
      filters.hobbies,
      filters.positions,
      filters.kinks,
      filters.bodyTypes,
      filters.sexuality,
      filters.condoms,
      filters.drugs,
      filters.weed,
      filters.smoking,
      filters.drinking,
    ].some((items) => items.length > 0);

  const filteredUsers = users.filter((user) => {
    const distanceMiles = Number.parseFloat(user.distance);
    if (Number.isFinite(distanceMiles) && distanceMiles > filters.distance) {
      return false;
    }

    if (user.age !== null) {
      if (user.age < filters.ageRange[0] || user.age > filters.ageRange[1]) {
        return false;
      }
    }

    if (filters.lookingFor.length > 0) {
      const lookingFor = user.lookingFor.map((item) => item.toLowerCase());
      if (!filters.lookingFor.some((item) => lookingFor.includes(item.toLowerCase()))) {
        return false;
      }
    }

    if (filters.vibes.length > 0) {
      const vibes = user.vibes.map((item) => item.toLowerCase());
      if (!filters.vibes.some((item) => vibes.includes(item.toLowerCase()))) {
        return false;
      }
    }

    return true;
  });

  // Merge userLocation as a special pin
  const mergedUsers = userLocation
    ? [
        ...filteredUsers,
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
    : filteredUsers;

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-background/90 via-background/45 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-30 px-5 pb-12 pt-5">
        <div className="flex items-center justify-between">
          <h1
            className="cruush-logo-text text-3xl tracking-tight"
          >
            cruush
          </h1>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-background/25 p-1 backdrop-blur-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/lucky')}
              title="I'm Feeling Lucky"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <Sparkles className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/safety')}
              title="Safety Center"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <Shield className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" title="Notifications" className="rounded-full text-white/90 hover:bg-white/10">
              <Bell className="w-5 h-5" />
            </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/settings')}
                title="Settings"
                className="rounded-full text-white/90 hover:bg-white/10"
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-80 bg-gradient-to-t from-background via-background/78 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background/65 to-transparent" />

        {error ? (
          <div className="absolute left-4 right-20 top-24 z-20 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="absolute inset-x-4 top-28 z-20 rounded-md bg-card/90 p-3 text-sm text-muted-foreground backdrop-blur-sm">
            Loading nearby people...
          </div>
        ) : null}

        {!loading && !error && users.length === 0 ? (
          <div className="absolute left-4 right-4 top-28 z-20 rounded-2xl border border-white/10 bg-background/88 p-4 text-sm text-white/72 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">No one nearby yet</div>
            <p className="mt-2 leading-6">
              Keep your location on and profile visible. When someone nearby checks in, they will land here instead of a demo tray.
            </p>
          </div>
        ) : null}

        {!isMobile && selectedUser ? (
          <MapProfilePopup
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        ) : null}

        <div className="absolute right-4 top-28 z-30 flex flex-col items-end gap-2">
          <Button
            className="rounded-full border border-white/15 px-5 shadow-[0_12px_35px_rgba(255,7,114,0.25)]"
            style={{
              background: 'var(--cruush-gradient)',
            }}
            onClick={() => setIsFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {hasActiveFilters ? (
              <span className="ml-2 rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-semibold">
                On
              </span>
            ) : null}
          </Button>

          <div className="flex flex-col gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => mapInstance?.zoomIn()}
              disabled={!mapInstance}
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              onClick={() => mapInstance?.zoomOut()}
              disabled={!mapInstance}
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {filteredUsers.length > 0 && (
          <div className="absolute inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 px-4">
            <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-background/40 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-xs uppercase tracking-[0.18em] text-white/70">Recently Active</p>
                <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-white/75">
                  Last Active
                </div>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
              {filteredUsers
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
                    className="group flex w-16 flex-shrink-0 flex-col items-center text-center"
                  >
                    <div className="relative">
                      <HeartPhoto
                        className="w-16 transition-transform group-hover:scale-105"
                        label={`${user.name} preview`}
                        photo={user.photo}
                        fallback={<Heart className="w-6 h-6 text-white/22" />}
                      />
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-2 py-0.5 font-mono text-[10px] text-white/90 shadow-lg backdrop-blur-sm">
                        {user.lastActive}
                      </div>
                    </div>
                    <p className="mt-1 w-full truncate text-xs text-white/90">{user.name}</p>
                    <p className="text-[10px] text-white/45">{user.distance}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <MapFiltersSurface
          mode="sheet"
          open={isFiltersOpen}
          onOpenChange={setIsFiltersOpen}
          value={filters}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTER_STATE)}
          onApply={() => setIsFiltersOpen(false)}
        />
      </div>
    </div>
  );
}
