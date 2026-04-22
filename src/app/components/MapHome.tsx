import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Filter, Bell, Shield, Sparkles, Settings as SettingsIcon, ZoomIn, ZoomOut, Heart } from 'lucide-react';
import { Button } from './ui/button';
import MapView from './MapView';
import ProfileCard from './ProfileCard';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

export default function MapHome() {
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);


  // Fetch users on mount and poll every 10 seconds for live updates
  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  // Get current user's geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          console.warn('Geolocation error:', err);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    }
  }, []);

  const fetchUsers = async () => {
    try {
      // Only fetch a limited number of users for performance
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-546a0ad0/users?limit=50`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      const data = await response.json();
      let fetchedUsers = (data.users || []).slice(0, 50);

      // Try to get the current user from localStorage
      let currentUser: any = null;
      try {
        currentUser = JSON.parse(localStorage.getItem('cruush_user') || 'null');
      } catch {}

      // If we have live geolocation, update the current user's lat/lng
      if (currentUser && userLocation) {
        currentUser.lat = userLocation.lat;
        currentUser.lng = userLocation.lng;
      }

      // Only add if valid and not already present
      if (
        currentUser &&
        typeof currentUser.lat === 'number' &&
        typeof currentUser.lng === 'number' &&
        currentUser.id &&
        !fetchedUsers.some((u: any) => u.id === currentUser.id)
      ) {
        fetchedUsers = [currentUser, ...fetchedUsers];
      }

      setUsers(fetchedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col relative">
      <header className="bg-card border-b border-border p-4 flex items-center justify-between z-10">
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
      </header>

      <div className="flex-1 relative">
        <MapView onPinClick={setSelectedUser} users={users} onMapLoad={setMapInstance} mapInstance={mapInstance} userLocation={userLocation} />

        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
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
            <Button
              size="icon"
              variant="secondary"
              onClick={() => {
                if (mapInstance && userLocation) {
                  mapInstance.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
                }
              }}
              disabled={!mapInstance || !userLocation}
              className="bg-card/90 backdrop-blur-sm"
              title="Recenter to your location"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
            </Button>
          </div>
        </div>

        {!selectedUser && users.length > 0 && (
          <div className="absolute bottom-20 left-0 right-0 z-20 pb-2">
            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground">Recently Active</p>
            </div>
            <div className="flex gap-3 overflow-x-auto px-4 scrollbar-hide">
              {users
                .sort((a, b) => {
                  const aMinutes = parseInt(a.lastActive) || 999;
                  const bMinutes = parseInt(b.lastActive) || 999;
                  return aMinutes - bMinutes;
                })
                .slice(0, 10)
                .map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className="flex-shrink-0 w-20"
                  >
                    <div className="relative">
                      <div
                        className="w-20 h-28 rounded-xl overflow-hidden bg-gradient-to-br from-crimson-dark to-crimson-bright"
                        style={{ aspectRatio: '9/16' }}
                      >
                        {user.photo ? (
                          <img
                            src={user.photo}
                            alt={user.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Heart className="w-8 h-8 text-white/20" />
                          </div>
                        )}
                      </div>
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

        {selectedUser && (
          <div className="absolute bottom-20 left-0 right-0 px-4 z-20">
            <ProfileCard
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onViewProfile={() => navigate(`/profile/${selectedUser.id}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
