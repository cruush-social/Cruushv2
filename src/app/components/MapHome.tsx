// Vite env type declaration for TypeScript
/// <reference types="vite/client" />
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { createMapMarkerBadge, type CruushMapInstance, type MapMarker } from './MapView';
import { Filter, MapPin, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { useIsMobile } from './ui/use-mobile';
import CruushIconImage from './CruushIconImage';
import MapView from './MapView';
import MapProfilePopup from './MapProfilePopup';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';
import { getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';
import { getMutualCruushMap, type MutualCruushActivityItem } from '../lib/cruushApi';
import { addCruushChangedListener } from '../lib/cruushEvents';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import {
  emptyProfilePayload,
  getMyProfile,
  saveMyProfile,
  type ProfilePayload,
  type ProfileRecord,
  type ProfileVisibilityRules,
} from '../lib/profileApi';
import { CROWDS } from '../lib/profileOptions';
import {
  approximateDisplayCoordinates,
  type ApproximateCoordinates,
} from '../lib/locationPrivacy';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import luckyIconWhite from '../assets/ui-icons/lucky-white.png';
import notificationsIconWhite from '../assets/ui-icons/notifications-white.png';
import safetyIconWhite from '../assets/ui-icons/safety-white.png';
import settingsIconWhite from '../assets/ui-icons/settings-white.png';
import visibilityIconWhite from '../assets/ui-icons/visibility-white.png';

const DISCOVERY_MAP_LIMIT = 50;
const LOCATION_PROMPT_SESSION_KEY = 'cruush-location-permission-prompted';

const DEMO_NYC_PROFILE_PHOTO = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <defs>
    <radialGradient id="skin" cx="50%" cy="34%" r="68%">
      <stop offset="0%" stop-color="#ffd0df"/>
      <stop offset="58%" stop-color="#b84a65"/>
      <stop offset="100%" stop-color="#36121d"/>
    </radialGradient>
    <linearGradient id="backdrop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff0072"/>
      <stop offset="55%" stop-color="#5d1741"/>
      <stop offset="100%" stop-color="#070707"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" fill="url(#backdrop)"/>
  <circle cx="230" cy="62" r="52" fill="#22b8ff" opacity=".24"/>
  <circle cx="102" cy="92" r="76" fill="#ffffff" opacity=".08"/>
  <circle cx="160" cy="128" r="70" fill="url(#skin)"/>
  <path d="M58 320c8-78 62-126 136-126 62 0 108 42 118 126z" fill="#090909"/>
  <path d="M75 320c11-46 45-76 93-76 38 0 70 24 84 76z" fill="#d11f3a" opacity=".64"/>
  <path d="M78 138c12-66 52-96 109-82 42 10 66 42 70 92-30-42-68-52-114-34-22 9-46 24-65 24z" fill="#080808"/>
  <circle cx="135" cy="136" r="8" fill="#11080d"/>
  <circle cx="190" cy="136" r="8" fill="#11080d"/>
  <path d="M134 174c18 15 42 15 60 0" fill="none" stroke="#fff1f6" stroke-width="9" stroke-linecap="round" opacity=".7"/>
  <path d="M36 42h92" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity=".22"/>
  <path d="M42 68h58" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity=".18"/>
</svg>
`)}`;

const DEMO_NYC_DISCOVERY_USER: DiscoveryUser = {
  id: 'demo-nyc-connected-pin',
  name: 'Mika Demo',
  display_name: 'Mika Demo',
  age: 29,
  pronouns: 'he/they',
  lat: 40.7336,
  lng: -74.0027,
  lastActive: '3m ago',
  distance: 'Demo NYC pin',
  lookingFor: ['Cruising', 'Tonight', 'Consent first'],
  vibes: ['Red heart pin', 'Photo fill', 'West Village', 'Bear', 'Daddy'],
  position: ['Versatile'],
  role: ['Switch'],
  hostingTravel: ['Can Host'],
  photo: DEMO_NYC_PROFILE_PHOTO,
  isDemo: true,
};

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

function uniqueValues(values: string[] = []) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeVisibilityRules(rules?: ProfileVisibilityRules): ProfileVisibilityRules {
  const defaults = emptyProfilePayload.visibility_rules;

  return {
    ...defaults,
    ...(rules ?? {}),
    active_crowd_modes: uniqueValues(rules?.active_crowd_modes ?? defaults.active_crowd_modes),
    identities: uniqueValues(rules?.identities ?? defaults.identities),
    presentations: uniqueValues(rules?.presentations ?? defaults.presentations),
    looking_for: uniqueValues(rules?.looking_for ?? defaults.looking_for),
    timing: uniqueValues(rules?.timing ?? defaults.timing),
    hosting: uniqueValues(rules?.hosting ?? defaults.hosting),
    vibes: uniqueValues(rules?.vibes ?? defaults.vibes),
    crowds: uniqueValues(rules?.crowds ?? defaults.crowds),
    hobbies: uniqueValues(rules?.hobbies ?? defaults.hobbies),
    positions: uniqueValues(rules?.positions ?? defaults.positions),
    roles: uniqueValues(rules?.roles ?? defaults.roles),
    kinks: uniqueValues(rules?.kinks ?? defaults.kinks),
    body_types: uniqueValues(rules?.body_types ?? defaults.body_types),
    sexuality: uniqueValues(rules?.sexuality ?? defaults.sexuality),
    substance_boundaries: uniqueValues(rules?.substance_boundaries ?? defaults.substance_boundaries),
    age_range: rules?.age_range ?? null,
    distance: rules?.distance ?? null,
  };
}

function visibilityRulesToState(rules?: ProfileVisibilityRules): VisibilityControlState {
  const normalizedRules = normalizeVisibilityRules(rules);

  return {
    ...DEFAULT_VISIBILITY_STATE,
    activeCrowdModes: normalizedRules.active_crowd_modes,
    ageRange: normalizedRules.age_range ?? DEFAULT_FILTER_STATE.ageRange,
    distance: normalizedRules.distance ?? DEFAULT_FILTER_STATE.distance,
    restrictAge: Boolean(normalizedRules.age_range),
    restrictDistance: typeof normalizedRules.distance === 'number',
    identities: normalizedRules.identities,
    presentations: normalizedRules.presentations,
    lookingFor: normalizedRules.looking_for,
    timing: normalizedRules.timing,
    hosting: normalizedRules.hosting,
    vibes: normalizedRules.vibes,
    crowds: normalizedRules.crowds,
    hobbies: normalizedRules.hobbies,
    positions: normalizedRules.positions,
    roles: normalizedRules.roles,
    kinks: normalizedRules.kinks,
    bodyTypes: normalizedRules.body_types,
    sexuality: normalizedRules.sexuality,
    substanceBoundaries: normalizedRules.substance_boundaries,
  };
}

function visibilityStateToRules(state: VisibilityControlState): ProfileVisibilityRules {
  return {
    active_crowd_modes: uniqueValues(state.activeCrowdModes),
    age_range: state.restrictAge ? state.ageRange : null,
    distance: state.restrictDistance ? state.distance : null,
    identities: uniqueValues(state.identities),
    presentations: uniqueValues(state.presentations),
    looking_for: uniqueValues(state.lookingFor),
    timing: uniqueValues(state.timing),
    hosting: uniqueValues(state.hosting),
    vibes: uniqueValues(state.vibes),
    crowds: uniqueValues(state.crowds),
    hobbies: uniqueValues(state.hobbies),
    positions: uniqueValues(state.positions),
    roles: uniqueValues(state.roles),
    kinks: uniqueValues(state.kinks),
    body_types: uniqueValues(state.bodyTypes),
    sexuality: uniqueValues(state.sexuality),
    substance_boundaries: uniqueValues(state.substanceBoundaries),
  };
}

function profileRecordToPayload(profile: ProfileRecord): ProfilePayload {
  const {
    id: _id,
    updated_at: _updatedAt,
    location: _location,
    viewer_relationship: _viewerRelationship,
    ...payload
  } = profile;

  return {
    ...emptyProfilePayload,
    ...payload,
    visibility_rules: normalizeVisibilityRules(payload.visibility_rules),
  };
}

function profileLocationToApproximateCoordinates(profile: ProfileRecord | null): ApproximateCoordinates | null {
  const location = profile?.location;
  const latitude = location?.fuzzy_lat ?? location?.lat ?? null;
  const longitude = location?.fuzzy_lng ?? location?.lng ?? null;

  if (latitude == null || longitude == null) {
    return null;
  }

  return {
    approximateLatitude: latitude,
    approximateLongitude: longitude,
    privacyRadiusMeters: location?.fuzz_radius_meters ?? 250,
  };
}

function claimLocationPromptForSession() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    if (window.sessionStorage.getItem(LOCATION_PROMPT_SESSION_KEY) === 'true') {
      return false;
    }

    window.sessionStorage.setItem(LOCATION_PROMPT_SESSION_KEY, 'true');
    return true;
  } catch {
    return true;
  }
}

function getAvailableCrowdModes(profile: ProfileRecord | null) {
  const profileCrowds = new Set(profile?.crowds ?? []);

  return CROWDS.filter((crowd) => profileCrowds.has(crowd) && (crowd !== 'T4T' || profile?.is_trans === true));
}

function hasActiveVisibilityControls(visibility: VisibilityControlState) {
  return visibility.restrictAge ||
    visibility.restrictDistance ||
    visibility.activeCrowdModes.length > 0 ||
    [
      visibility.identities,
      visibility.presentations,
      visibility.lookingFor,
      visibility.timing,
      visibility.hosting,
      visibility.vibes,
      visibility.crowds,
      visibility.hobbies,
      visibility.positions,
      visibility.roles,
      visibility.kinks,
      visibility.bodyTypes,
      visibility.sexuality,
      visibility.substanceBoundaries,
    ].some((items) => items.length > 0);
}

function mutualMapItemToDiscoveryUser(item: MutualCruushActivityItem): DiscoveryUser {
  return {
    id: item.user.id,
    name: item.user.name,
    display_name: item.user.name,
    age: null,
    pronouns: item.user.pronouns,
    lat: item.coordinates?.lat ?? 40.7128,
    lng: item.coordinates?.lng ?? -74.006,
    lastActive: item.lastActive,
    distance: item.distance,
    lookingFor: ['Mutual cruush'],
    vibes: item.vibes,
    scenes: [],
    archetypes: [],
    position: [],
    role: [],
    hostingTravel: [],
    photo: item.user.photo,
    relationship: {
      mutualCruush: true,
      canMessage: item.canMessage,
      ...(item.coordinates ? { precision: item.coordinates.precision } : {}),
    },
  };
}

export default function MapHome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [userApproximateLocation, setUserApproximateLocation] = useState<ApproximateCoordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<CruushMapInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<DiscoveryUser | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isRecentlyActiveOpen, setIsRecentlyActiveOpen] = useState(true);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityControlState>(DEFAULT_VISIBILITY_STATE);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<ProfileRecord | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const isMutualMapMode = searchParams.get('mode') === 'mutuals';
  const focusUserId = searchParams.get('focusUserId');

  const openProfile = (user: DiscoveryUser) => {
    if (user.isDemo) {
      return;
    }

    navigate(`/profile/${user.id}`, {
      state: {
        distance: user.distance,
        lastActive: user.lastActive,
      },
    });
  };

  const handleUserSelect = (user: DiscoveryUser) => {
    if (user.isDemo) {
      setSelectedUser(user);
      return;
    }

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
    void fetchUsers(null);
  }, [isMutualMapMode]);

  useEffect(() => {
    let isMounted = true;

    getMyProfile()
      .then((profile) => {
        if (isMounted) {
          setCurrentProfile(profile);
          setVisibility(visibilityRulesToState(profile.visibility_rules));
        }
      })
      .catch((profileError) => {
        console.error('Error loading current profile for map marker:', profileError);
        if (isMounted) {
          setCurrentProfile(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setProfileLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchUsers = async (coordinates: { lat: number; lng: number } | null, filterParams?: FilterState) => {
    setLoading(true);
    setError(null);
    try {
      if (isMutualMapMode) {
        const mutualMapItems = await getMutualCruushMap();
        setUsers(mutualMapItems
          .filter((item) => item.coordinates)
          .map(mutualMapItemToDiscoveryUser));
      } else {
        setUsers(filterParams
          ? await getNearbyUsers(coordinates, filterParams, { limit: DISCOVERY_MAP_LIMIT })
          : await getNearbyUsers(coordinates, undefined, { limit: DISCOVERY_MAP_LIMIT }));
      }
    } catch (fetchError) {
      console.error('Error fetching users:', fetchError);
      setUsers([]);
      setError(fetchError instanceof Error ? fetchError.message : isMutualMapMode ? 'Failed to load mutual cruushes.' : 'Failed to load nearby people.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return addCruushChangedListener((payload) => {
      if (payload.mutual) {
        setUsers((currentUsers) => currentUsers.map((user) => user.id === payload.targetUserId
          ? {
              ...user,
              relationship: {
                mutualCruush: true,
                canMessage: payload.permissions?.canMessage ?? user.relationship?.canMessage ?? true,
                precision: user.relationship?.precision,
              },
            }
          : user));
      }
      setSelectedUser((currentUser) => currentUser?.id === payload.targetUserId ? null : currentUser);
      void fetchUsers(getCurrentFetchCoordinates(), filters);
    });
  }, [filters, isMutualMapMode, userApproximateLocation]);

  const requestUserLocation = (centerAfterUpdate = false) => {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Your browser does not support location sharing.');
      return;
    }

    setLocationStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Exact browser coordinates stay local here. Only approximate coordinates
        // should ever be displayed on the map or shared with other users.
        const approximateLocation = approximateDisplayCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        setUserApproximateLocation(approximateLocation);
        setLocationStatus('ready');
        if (centerAfterUpdate) {
          mapInstance?.setCenter([
            approximateLocation.approximateLongitude,
            approximateLocation.approximateLatitude,
          ]);
          mapInstance?.setZoom(14);
        }
        void fetchUsers({
          lat: approximateLocation.approximateLatitude,
          lng: approximateLocation.approximateLongitude,
        });
      },
      () => {
        setLocationStatus('error');
        setLocationError('Location permission was not granted. You can keep browsing the NYC beta map.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 },
    );
  };

  useEffect(() => {
    if (
      !profileLoaded ||
      isMutualMapMode ||
      userApproximateLocation ||
      locationStatus !== 'idle' ||
      !claimLocationPromptForSession()
    ) {
      return;
    }

    requestUserLocation();
  }, [isMutualMapMode, locationStatus, profileLoaded, userApproximateLocation]);

  const hasActiveFilters =
    isMutualMapMode ||
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
      filters.crowds,
      filters.hobbies,
      filters.positions,
      filters.roles,
      filters.kinks,
      filters.bodyTypes,
      filters.sexuality,
      filters.substanceBoundaries,
    ].some((items) => items.length > 0);

  const availableCrowdModes = getAvailableCrowdModes(currentProfile);
  const safeVisibility: VisibilityControlState = {
    ...visibility,
    activeCrowdModes: visibility.activeCrowdModes.filter((crowd) => availableCrowdModes.includes(crowd)),
  };
  const hasActiveVisibility = hasActiveVisibilityControls(safeVisibility);

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
      const vibes = [...user.vibes, ...(user.scenes ?? []), ...(user.archetypes ?? [])].map((item) => item.toLowerCase());
      if (!filters.vibes.some((item) => vibes.includes(item.toLowerCase()))) {
        return false;
      }
    }

    return true;
  });

  const getCurrentFetchCoordinates = () => userApproximateLocation
    ? {
        lat: userApproximateLocation.approximateLatitude,
        lng: userApproximateLocation.approximateLongitude,
      }
    : null;

  const handleVisibilityChange = (nextVisibility: VisibilityControlState) => {
    setVisibility({
      ...nextVisibility,
      activeCrowdModes: nextVisibility.activeCrowdModes.filter((crowd) => availableCrowdModes.includes(crowd)),
    });
  };

  const handleClearVisibility = () => {
    const clearedVisibility = {
      ...DEFAULT_VISIBILITY_STATE,
      activeCrowdModes: [],
    };

    setVisibility(clearedVisibility);
    setVisibilityError(null);
  };

  const handleApplyVisibility = async () => {
    if (!currentProfile) {
      setVisibilityError('Create your profile before changing visibility.');
      return;
    }

    const nextVisibility = {
      ...safeVisibility,
      activeCrowdModes: safeVisibility.activeCrowdModes.filter((crowd) => availableCrowdModes.includes(crowd)),
    };
    const visibilityRules = visibilityStateToRules(nextVisibility);

    setSavingVisibility(true);
    setVisibilityError(null);
    try {
      const savedProfile = await saveMyProfile({
        ...profileRecordToPayload(currentProfile),
        visibility_rules: visibilityRules,
      });
      setCurrentProfile(savedProfile);
      setVisibility(visibilityRulesToState(savedProfile.visibility_rules));
      setIsVisibilityOpen(false);
      void fetchUsers(getCurrentFetchCoordinates(), filters);
    } catch (saveError) {
      setVisibilityError(saveError instanceof Error ? saveError.message : 'Failed to save visibility.');
    } finally {
      setSavingVisibility(false);
    }
  };

  const shouldShowDemoUser = !isMutualMapMode && !loading && !error && users.length === 0;
  const displayedUsers = shouldShowDemoUser ? [DEMO_NYC_DISCOVERY_USER] : filteredUsers;
  const currentUserMapLocation = useMemo(
    () => userApproximateLocation ?? profileLocationToApproximateCoordinates(currentProfile),
    [currentProfile, userApproximateLocation],
  );

  const handleCenterMyLocation = () => {
    if (currentUserMapLocation) {
      setLocationError(null);
      mapInstance?.setCenter([
        currentUserMapLocation.approximateLongitude,
        currentUserMapLocation.approximateLatitude,
      ]);
      mapInstance?.setZoom(14);
      return;
    }

    requestUserLocation(true);
  };

  const mapMarkers = useMemo<MapMarker[]>(() => {
    const nearbyMarkers = displayedUsers.map((user) => {
      const approximateCoordinates = approximateDisplayCoordinates({
        latitude: user.lat,
        longitude: user.lng,
      });

      return {
        id: user.id,
        displayName: user.name,
        approximateLatitude: approximateCoordinates.approximateLatitude,
        approximateLongitude: approximateCoordinates.approximateLongitude,
        lastActiveLabel: user.lastActive,
        photo: user.photo,
        badge: createMapMarkerBadge(user.position, user.hostingTravel),
        relationship: user.relationship?.mutualCruush
          ? {
              kind: 'mutual_cruush',
              precision: user.relationship.precision,
              canMessage: user.relationship.canMessage,
            }
          : null,
      };
    });

    if (!currentUserMapLocation) {
      return nearbyMarkers;
    }

    return [
      {
        id: 'me',
        displayName: 'You',
        approximateLatitude: currentUserMapLocation.approximateLatitude,
        approximateLongitude: currentUserMapLocation.approximateLongitude,
        lastActiveLabel: userApproximateLocation ? 'Now' : 'Saved area',
        photo: currentProfile?.photos[0] ?? null,
        isCurrentUser: true,
        badge: createMapMarkerBadge(currentProfile?.position ?? []),
      },
      ...nearbyMarkers,
    ];
  }, [currentProfile, currentUserMapLocation, displayedUsers, userApproximateLocation]);

  const focusedMutualMapLocation = useMemo(() => {
    if (!isMutualMapMode || !focusUserId) {
      return null;
    }

    const focusedUser = displayedUsers.find((user) => user.id === focusUserId);

    if (!focusedUser) {
      return null;
    }

    return approximateDisplayCoordinates({
      latitude: focusedUser.lat,
      longitude: focusedUser.lng,
    });
  }, [displayedUsers, focusUserId, isMutualMapMode]);

  const handleMarkerSelect = (marker: MapMarker) => {
    const selectedMarkerUser = displayedUsers.find((user) => user.id === marker.id);

    if (selectedMarkerUser) {
      handleUserSelect(selectedMarkerUser);
    }
  };

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-background/90 via-background/45 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-30 px-3 pb-12 pt-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col items-start">
            <h1 className="sr-only">cruush</h1>
            <img
              alt=""
              aria-hidden="true"
              className="h-[6.25rem] w-auto object-contain sm:h-[7.03125rem]"
              draggable={false}
              src={cruushLogo}
            />
            <div className="mt-1 inline-flex rounded-full border border-white/10 bg-background/35 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/72 backdrop-blur-md">
              {isMutualMapMode ? 'Mutual cruushes' : 'NYC beta'}
            </div>
          </div>

          <div className="mt-11 flex items-center gap-2 rounded-full border border-white/10 bg-background/25 p-1 backdrop-blur-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/lucky')}
              aria-label="I'm Feeling Lucky"
              title="I'm Feeling Lucky"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <CruushIconImage src={luckyIconWhite} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/safety')}
              aria-label="Safety Center"
              title="Safety Center"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <CruushIconImage src={safetyIconWhite} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              title="Notifications"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <CruushIconImage src={notificationsIconWhite} />
            </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/settings')}
                aria-label="Settings"
                title="Settings"
                className="rounded-full text-white/90 hover:bg-white/10"
              >
                <CruushIconImage src={settingsIconWhite} />
              </Button>
            </div>
          </div>
        </div>

      <div className="absolute inset-0">
        <MapView
          onPinClick={handleMarkerSelect}
          onMapClick={() => setSelectedUser(null)}
          markers={mapMarkers}
          focusCoordinates={focusedMutualMapLocation ?? currentUserMapLocation}
          onMapReady={setMapInstance}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background/65 to-transparent" />

        {error ? (
          <div className="absolute left-4 right-20 top-24 z-20 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {locationError ? (
          <div className="absolute left-4 right-20 top-40 z-20 rounded-md border border-white/10 bg-background/82 p-3 text-sm text-white/72 backdrop-blur-md">
            {locationError}
          </div>
        ) : null}

        {loading ? (
          <div className="absolute inset-x-4 top-28 z-20 rounded-md bg-card/90 p-3 text-sm text-muted-foreground backdrop-blur-sm">
            Loading nearby people...
          </div>
        ) : null}

        {shouldShowDemoUser ? (
          <div className="absolute left-4 right-4 top-28 z-20 rounded-2xl border border-white/10 bg-background/88 p-4 text-sm text-white/72 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md sm:right-auto sm:max-w-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Demo NYC pin</div>
            <p className="mt-2 leading-6">
              Mika Demo is fake data near the West Village so the connected-user pin design is visible while real discovery is empty.
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
            className={`rounded-full border px-5 shadow-[0_12px_35px_rgba(0,0,0,0.25)] ${
              hasActiveFilters
                ? 'border-white/15 text-white'
                : 'border-white/10 bg-background/68 text-white backdrop-blur-md hover:bg-white/10'
            }`}
            style={hasActiveFilters ? { background: 'var(--cruush-gradient)' } : undefined}
            onClick={() => setIsFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {isMutualMapMode ? 'Mutuals' : 'Seeking'}
          </Button>

          <Button
            type="button"
            onClick={() => {
              setVisibilityError(null);
              setIsVisibilityOpen(true);
            }}
            className={`rounded-full border px-5 text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] has-[>img]:px-3 ${
              hasActiveVisibility
                ? 'border-white/15'
                : 'border-white/10 bg-background/68 backdrop-blur-md hover:bg-white/10'
            }`}
            style={hasActiveVisibility ? { background: 'var(--cruush-gradient)' } : undefined}
          >
            <CruushIconImage src={visibilityIconWhite} className="mr-2 h-4 w-4" />
            Visibility
          </Button>

          <div className="flex flex-col gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={handleCenterMyLocation}
              disabled={locationStatus === 'locating' || !mapInstance}
              aria-label={locationStatus === 'locating' ? 'Finding your location' : 'Center your location'}
              title={locationStatus === 'locating' ? 'Finding your location' : 'Center your location'}
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
            >
              <MapPin className="h-4 w-4" />
            </Button>
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

        {displayedUsers.length > 0 && (
          <div className="absolute inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 px-4">
            <div
              className={`mx-auto rounded-2xl border border-white/10 bg-background/40 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl ${
                isRecentlyActiveOpen ? 'max-w-5xl p-3' : 'w-fit max-w-[calc(100vw-2rem)] px-4 py-2'
              }`}
              data-testid="recently-active-panel"
            >
              <button
                type="button"
                aria-controls="recently-active-tray"
                aria-expanded={isRecentlyActiveOpen}
                className={`block rounded px-1 text-left text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65 ${
                  isRecentlyActiveOpen ? 'mb-2' : 'mb-0'
                }`}
                onClick={() => setIsRecentlyActiveOpen((open) => !open)}
              >
                Recently Active
              </button>
              {isRecentlyActiveOpen ? (
                <div id="recently-active-tray" className="flex gap-3 overflow-x-auto scrollbar-hide" data-testid="recently-active-tray">
                {[...displayedUsers]
                  .sort((a, b) => {
                    const firstUserMinutes = getLastActiveMinutes(a.lastActive);
                    const secondUserMinutes = getLastActiveMinutes(b.lastActive);
                    return firstUserMinutes - secondUserMinutes;
                  })
                  .slice(0, 10)
                  .map((user) => (
                    <button
                      key={user.id}
                      aria-label={`Open ${user.name} profile`}
                      onClick={() => handleUserSelect(user)}
                      className="group block w-20 flex-shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65"
                      data-testid={`recently-active-tile-${user.id}`}
                    >
                      <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] transition-transform group-hover:scale-[1.02]">
                        {user.photo ? (
                          <img
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover"
                            draggable={false}
                            src={user.photo}
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            className="flex h-full w-full items-center justify-center"
                            style={{ background: 'var(--cruush-gradient)' }}
                          >
                            <CruushIconImage src={cruushIconWhite} className="h-10 w-10 opacity-75" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        <MapFiltersSurface
          mode="sheet"
          mutualCruushesOnly={isMutualMapMode}
          open={isFiltersOpen}
          onOpenChange={setIsFiltersOpen}
          title="Seeking"
            description="Refine who appears nearby by distance, profile details, and vibe."
          value={filters}
          onChange={setFilters}
          onMutualCruushesOnlyChange={(enabled) => {
            navigate(enabled ? '/map?mode=mutuals' : '/map');
          }}
          onClear={() => {
            setFilters(DEFAULT_FILTER_STATE);
            void fetchUsers(getCurrentFetchCoordinates(), DEFAULT_FILTER_STATE);
          }}
          onApply={() => {
            setIsFiltersOpen(false);
            void fetchUsers(getCurrentFetchCoordinates(), filters);
          }}
        />

        <MapVisibilitySurface
          open={isVisibilityOpen}
          onOpenChange={setIsVisibilityOpen}
          value={safeVisibility}
          availableCrowdModes={availableCrowdModes}
          saving={savingVisibility}
          error={visibilityError}
          onChange={handleVisibilityChange}
          onClear={handleClearVisibility}
          onApply={handleApplyVisibility}
        />
      </div>
    </div>
  );
}
