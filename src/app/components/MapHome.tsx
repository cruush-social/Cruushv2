// Vite env type declaration for TypeScript
/// <reference types="vite/client" />
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Filter, Bell, Shield, Sparkles, Settings as SettingsIcon, ZoomIn, ZoomOut, Heart } from 'lucide-react';
import { Button } from './ui/button';
import MapView from './MapView';
import ProfileCard from './ProfileCard';
// Use Vite environment variables for Supabase config
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

export default function MapHome() {
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<any>(null);

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
    fetchUsers();
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/users`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
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
        <MapView onPinClick={setSelectedUser} users={mergedUsers} userLocation={userLocation} />

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
