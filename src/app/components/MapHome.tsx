// Vite env type declaration for TypeScript
/// <reference types="vite/client" />
import type { MouseEvent, PointerEvent, WheelEvent } from 'react';
import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ExternalLink, Eye, Filter, Mail, MapPin, MessageCircle, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { useIsMobile } from './ui/use-mobile';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import MapProfilePopup from './MapProfilePopup';
import CruiseCarouselSlot from './CruiseCarouselSlot';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';
import { getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';
import { getMutualCruushMap, type MutualCruushActivityItem } from '../lib/cruushApi';
import { DEFAULT_PRIVACY_SETTINGS, getMyPrivacySettings, type PrivacySettings } from '../lib/privacyApi';
import { getMyBillingStatus, type BillingStatus } from '../lib/billingApi';
import { addCruushChangedListener } from '../lib/cruushEvents';
import { addNotificationsChangedListener, getNotificationSummary } from '../lib/notificationsApi';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';
import { emailEventPass, getActiveEvents, joinEventChat, revealEventPass, type EventPassReveal, type LaunchEvent } from '../lib/eventsApi';
import type { DenseVenueConfig } from '../lib/denseVenueMarkers';
import { getProfileGradientCss } from '../lib/profileGradient';
import { addDlModeChangedListener, isDlModeEnabled } from '../lib/dlMode';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import {
  emptyProfilePayload,
  getMyProfile,
  saveMyProfile,
  type ProfilePayload,
  type ProfileRecord,
  type ProfileVisibilityRules,
} from '../lib/profileApi';
import { CROWDS, normalizeCrowdValues } from '../lib/profileOptions';
import {
  approximateDisplayCoordinates,
  type ApproximateCoordinates,
} from '../lib/locationPrivacy';
import { decryptDisplayLocationToken } from '../lib/displayLocationTokens';
import { canUseDeveloperMapToolsEmail } from '../lib/developerMapTools';
import { createMapMarkerBadge, type CruushMapInstance, type MapMarker } from '../lib/mapMarkers';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import ghostIconColored from '../assets/ui-icons/ghost-colored.svg';
import ghostIconWhite from '../assets/ui-icons/ghost-white.svg';
import crowdIconColored from '../assets/ui-icons/crowds-colored.svg';
import crowdIconWhite from '../assets/ui-icons/crowds-white.svg';
import luckyIconWhite from '../assets/ui-icons/lucky-white.png';
import notificationsIconWhite from '../assets/ui-icons/notifications-white.png';
import settingsIconWhite from '../assets/ui-icons/settings-white.png';

const DISCOVERY_MAP_LIMIT = 50;
const CROWD_NOTICE_ORDER = ['Dyke', 'Gay', 'T4T'];
const CROWD_NOTICE_LABELS: Record<string, string> = {
  Dyke: 'Dyke',
  Gay: 'Gay',
  T4T: 'T4T',
};

const MapView = lazy(() => import('./MapView'));

export { canUseDeveloperMapToolsEmail };

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
    active_crowd_modes: normalizeCrowdValues(rules?.active_crowd_modes ?? defaults.active_crowd_modes),
    identities: uniqueValues(rules?.identities ?? defaults.identities),
    presentations: uniqueValues(rules?.presentations ?? defaults.presentations),
    looking_for: uniqueValues(rules?.looking_for ?? defaults.looking_for),
    timing: uniqueValues(rules?.timing ?? defaults.timing),
    hosting: uniqueValues(rules?.hosting ?? defaults.hosting),
    vibes: uniqueValues(rules?.vibes ?? defaults.vibes),
    crowds: normalizeCrowdValues(rules?.crowds ?? defaults.crowds),
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
    active_crowd_modes: normalizeCrowdValues(state.activeCrowdModes),
    age_range: state.restrictAge ? state.ageRange : null,
    distance: state.restrictDistance ? state.distance : null,
    identities: uniqueValues(state.identities),
    presentations: uniqueValues(state.presentations),
    looking_for: uniqueValues(state.lookingFor),
    timing: uniqueValues(state.timing),
    hosting: uniqueValues(state.hosting),
    vibes: uniqueValues(state.vibes),
    crowds: normalizeCrowdValues(state.crowds),
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
    crowds: normalizeCrowdValues(payload.crowds ?? emptyProfilePayload.crowds),
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

function getAvailableCrowdModes(profile: ProfileRecord | null) {
  const profileCrowds = new Set(normalizeCrowdValues(profile?.crowds ?? []));

  return CROWDS.filter((crowd) => profileCrowds.has(crowd) && (crowd !== 'T4T' || profile?.is_trans === true));
}

function formatActiveCrowdNotice(activeCrowdModes: string[]) {
  const normalizedActiveCrowdModes = normalizeCrowdValues(activeCrowdModes);
  const activeSet = new Set(normalizedActiveCrowdModes);
  const orderedCrowds = [
    ...CROWD_NOTICE_ORDER.filter((crowd) => activeSet.has(crowd)),
    ...normalizedActiveCrowdModes.filter((crowd) => !CROWD_NOTICE_ORDER.includes(crowd)),
  ];
  const labels = [...new Set(orderedCrowds)].map((crowd) => CROWD_NOTICE_LABELS[crowd] ?? crowd);

  if (labels.length === 0) {
    return null;
  }

  const suffix = labels.length === 1 ? 'Crowd Active' : 'Crowds Active';
  if (labels.length === 1) {
    return `${labels[0]} ${suffix}`;
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]} ${suffix}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]} ${suffix}`;
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
    badges: item.user.badges,
    displayMode: item.coordinates?.precision === 'precise' ? 'PRECISE' : 'GHOST',
    animationHint: item.animationHint,
    displayExpiresAtMs: item.displayExpiresAtMs,
    relationship: {
      mutualCruush: true,
      canMessage: item.canMessage,
      ...(item.coordinates ? { precision: item.coordinates.precision } : {}),
    },
  };
}

type MapHomeProps = {
  developerToolsEnabled?: boolean;
};

type MapRouteState = {
  openOwnProfilePanel?: boolean;
  centerEventSlug?: string;
} | null;

type LuckySlotState =
  | {
      mode: 'profile';
      targetUser: DiscoveryUser;
      nonce: number;
    }
  | {
      mode: 'locked' | 'empty';
      nonce: number;
    };

const LAUNCH_EVENT_SLUG = 'the-chocolate-factory-launch';
const METERS_PER_MILE = 1609.344;

export default function MapHome(_props: MapHomeProps = {}) {
  const location = useLocation();
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
  const [luckySlot, setLuckySlot] = useState<LuckySlotState | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isRecentlyActiveOpen, setIsRecentlyActiveOpen] = useState(() => !isMobile);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityControlState>(DEFAULT_VISIBILITY_STATE);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<ProfileRecord | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [activeEvents, setActiveEvents] = useState<LaunchEvent[]>([]);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | null>(null);
  const [eventPass, setEventPass] = useState<EventPassReveal | null>(null);
  const [eventActionError, setEventActionError] = useState<string | null>(null);
  const [eventActionStatus, setEventActionStatus] = useState<string | null>(null);
  const [revealingEventPass, setRevealingEventPass] = useState(false);
  const [emailingEventPass, setEmailingEventPass] = useState(false);
  const [joiningEventChat, setJoiningEventChat] = useState(false);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const [profileLoaded, setProfileLoaded] = useState(false);
  const hasFetchedInitialUsersRef = useRef(false);
  const lastOwnProfilePanelRequestKeyRef = useRef<string | null>(null);
  const lastEventCenterRequestKeyRef = useRef<string | null>(null);
  const shouldAlignRecentlyActiveWithPreview = !isMobile && Boolean(selectedUser || luckySlot);
  const recentlyActiveDragRef = useRef({
    hasPointerCapture: false,
    isPointerDown: false,
    hasDragged: false,
    pointerId: -1,
    startScrollLeft: 0,
    startX: 0,
  });
  const isMutualMapMode = searchParams.get('mode') === 'mutuals';
  const focusUserId = searchParams.get('focusUserId');
  const routeState = location.state as MapRouteState;
  const shouldOpenOwnProfilePanel = !isMobile && routeState?.openOwnProfilePanel === true;
  const hasCruushPlus = billingStatus?.cruushPlus !== false;

  const dlModeEyeStyle = dlModeActive ? { stroke: 'url(#cruush-dl-eye-gradient)' } : undefined;

  useEffect(() => {
    let isMounted = true;

    getMyBillingStatus()
      .then((loadedBillingStatus) => {
        if (isMounted) {
          setBillingStatus(loadedBillingStatus);
        }
      })
      .catch(() => {
        if (isMounted) {
          setBillingStatus(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  useEffect(() => {
    let isMounted = true;

    getActiveEvents()
      .then((events) => {
        if (isMounted) {
          setActiveEvents(events);
        }
      })
      .catch((eventError) => {
        console.warn('Error loading launch events for map:', eventError);
        if (isMounted) {
          setActiveEvents([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    getNotificationSummary()
      .then((summary) => {
        if (isMounted) {
          setNotificationUnreadCount(summary.unreadCount);
        }
      })
      .catch(() => {
        if (isMounted) {
          setNotificationUnreadCount(0);
        }
      });

    const removeListener = addNotificationsChangedListener((payload) => {
      setNotificationUnreadCount(payload.unreadCount);
    });

    return () => {
      isMounted = false;
      removeListener();
    };
  }, []);

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
    setLuckySlot(null);

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

  const handleBlockedUser = (blockedUserId: string) => {
    setUsers((currentUsers) => currentUsers.filter((user) => user.id !== blockedUserId));
    setSelectedUser((currentUser) => currentUser?.id === blockedUserId ? null : currentUser);
  };

  useEffect(() => {
    if (isMobile && selectedUser) {
      setSelectedUser(null);
    }
    if (isMobile && luckySlot) {
      setLuckySlot(null);
    }
  }, [isMobile, luckySlot, selectedUser]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getMyProfile(),
      getMyPrivacySettings().catch(() => DEFAULT_PRIVACY_SETTINGS),
    ])
      .then(async ([profile, loadedPrivacySettings]) => {
        let initialFetchCoordinates: { lat: number; lng: number } | null = null;

        if (isMounted) {
          setCurrentProfile(profile);
          setPrivacySettings(loadedPrivacySettings);
          setVisibility(visibilityRulesToState(profile.visibility_rules));
        }

        if (profile.location?.display_location_token) {
          const displayPayload = await decryptDisplayLocationToken(profile.location.display_location_token);
          initialFetchCoordinates = {
            lat: displayPayload.latitude,
            lng: displayPayload.longitude,
          };

          if (isMounted) {
            setUserApproximateLocation({
              approximateLatitude: displayPayload.latitude,
              approximateLongitude: displayPayload.longitude,
              privacyRadiusMeters: displayPayload.accuracyDisplayM,
            });
          }
        } else {
          const savedProfileLocation = profileLocationToApproximateCoordinates(profile);

          if (savedProfileLocation) {
            initialFetchCoordinates = {
              lat: savedProfileLocation.approximateLatitude,
              lng: savedProfileLocation.approximateLongitude,
            };
          }
        }

        if (isMounted) {
          hasFetchedInitialUsersRef.current = true;
          void fetchUsers(initialFetchCoordinates);
        }
      })
      .catch((profileError) => {
        console.error('Error loading current profile for map marker:', profileError);
        if (isMounted) {
          setCurrentProfile(null);
          hasFetchedInitialUsersRef.current = true;
          void fetchUsers(null);
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

  useEffect(() => {
    if (!hasFetchedInitialUsersRef.current) {
      return;
    }

    void fetchUsers(getCurrentFetchCoordinates(), filters);
  }, [isMutualMapMode]);

  const discoveryRequestOptions = () => ({
    limit: DISCOVERY_MAP_LIMIT,
  });

  const fetchUsers = async (
    coordinates: { lat: number; lng: number } | null,
    filterParams?: FilterState,
  ) => {
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
          ? await getNearbyUsers(coordinates, filterParams, discoveryRequestOptions())
          : await getNearbyUsers(coordinates, undefined, discoveryRequestOptions()));
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
    const savedProfileLocation = profileLocationToApproximateCoordinates(currentProfile);

    if (
      !profileLoaded ||
      isMutualMapMode ||
      userApproximateLocation ||
      savedProfileLocation ||
      locationStatus !== 'idle'
    ) {
      return;
    }

    requestUserLocation();
  }, [currentProfile, isMutualMapMode, locationStatus, profileLoaded, userApproximateLocation]);

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
  const activeCrowdNotice = formatActiveCrowdNotice(safeVisibility.activeCrowdModes);

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

  const displayedUsers = filteredUsers;
  const savedProfileMapLocation = useMemo(
    () => profileLocationToApproximateCoordinates(currentProfile),
    [currentProfile],
  );
  const currentUserMapLocation = useMemo(
    () => userApproximateLocation ?? savedProfileMapLocation,
    [savedProfileMapLocation, userApproximateLocation],
  );
  const launchPartyEvent = useMemo(
    () => activeEvents.find((event) => event.slug === LAUNCH_EVENT_SLUG) ?? activeEvents[0] ?? null,
    [activeEvents],
  );
  const selectedEvent = useMemo(
    () => activeEvents.find((event) => event.slug === selectedEventSlug) ?? null,
    [activeEvents, selectedEventSlug],
  );
  const visibleEventPassIconName = eventPass?.iconName ?? selectedEvent?.passIconName ?? null;
  const denseVenue = useMemo<DenseVenueConfig | null>(() => launchPartyEvent
    ? {
        id: launchPartyEvent.slug,
        center: {
          approximateLatitude: launchPartyEvent.coordinates.latitude,
          approximateLongitude: launchPartyEvent.coordinates.longitude,
        },
        radiusMeters: launchPartyEvent.radiusMiles * METERS_PER_MILE,
        clusterZoom: 14,
        clusterThreshold: 25,
        maxIndividualMarkers: 120,
      }
    : null, [launchPartyEvent]);
  const ownProfilePreviewUser = useMemo<DiscoveryUser | null>(() => {
    if (!currentProfile) {
      return null;
    }

    return {
      id: currentProfile.id || 'me',
      name: currentProfile.display_name || 'Your profile',
      display_name: currentProfile.display_name || 'Your profile',
      age: currentProfile.year_of_birth ? new Date().getFullYear() - currentProfile.year_of_birth : null,
      pronouns: (currentProfile.pronouns ?? []).join(', ') || 'Ask me',
      lat: currentUserMapLocation?.approximateLatitude ?? 40.7128,
      lng: currentUserMapLocation?.approximateLongitude ?? -74.006,
      lastActive: currentProfile.location?.location_updated_at ? 'Saved area' : 'Now',
      distance: 'You',
      lookingFor: currentProfile.looking_for ?? [],
      vibes: currentProfile.vibes ?? [],
      scenes: currentProfile.scenes ?? [],
      archetypes: currentProfile.archetypes ?? [],
      position: currentProfile.position ?? [],
      role: currentProfile.role ?? [],
      hostingTravel: currentProfile.hosting_travel ?? [],
      photo: currentProfile.photos?.[0] ?? null,
      badges: currentProfile.badges ?? [],
      isCurrentUser: true,
    };
  }, [currentProfile, currentUserMapLocation]);

  useEffect(() => {
    if (!shouldOpenOwnProfilePanel) {
      lastOwnProfilePanelRequestKeyRef.current = null;
      return;
    }

    if (!ownProfilePreviewUser || lastOwnProfilePanelRequestKeyRef.current === location.key) {
      return;
    }

    setSelectedUser(ownProfilePreviewUser);
    lastOwnProfilePanelRequestKeyRef.current = location.key;
  }, [location.key, ownProfilePreviewUser, shouldOpenOwnProfilePanel]);

  useEffect(() => {
    const eventSlug = routeState?.centerEventSlug;

    if (!eventSlug) {
      lastEventCenterRequestKeyRef.current = null;
      return;
    }

    const targetEvent = activeEvents.find((event) => event.slug === eventSlug);
    const requestKey = `${location.key}:${eventSlug}`;

    if (!mapInstance || !targetEvent || lastEventCenterRequestKeyRef.current === requestKey) {
      return;
    }

    setSelectedUser(null);
    setLuckySlot(null);
    setSelectedEventSlug(targetEvent.slug);
    setEventPass(null);
    setEventActionError(null);
    setEventActionStatus(null);
    mapInstance.setCenter([
      targetEvent.coordinates.longitude,
      targetEvent.coordinates.latitude,
    ]);
    mapInstance.setZoom(15);
    lastEventCenterRequestKeyRef.current = requestKey;
  }, [activeEvents, location.key, mapInstance, routeState?.centerEventSlug]);

  const showLuckySlot = (nextSlot: Omit<LuckySlotState, 'nonce'>) => {
    setSelectedUser(null);
    setLuckySlot((currentSlot) => ({
      ...nextSlot,
      nonce: (currentSlot?.nonce ?? 0) + 1,
    } as LuckySlotState));
  };

  const handleFeelingLucky = () => {
    if (isMobile) {
      navigate('/lucky');
      return;
    }

    if (billingStatus?.cruushPlus !== true) {
      showLuckySlot({ mode: 'locked' });
      return;
    }

    const eligibleUsers = displayedUsers.filter((user) => !user.isDemo && !user.isCurrentUser);

    if (eligibleUsers.length === 0) {
      showLuckySlot({ mode: 'empty' });
      return;
    }

    const luckyUser = eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)];
    showLuckySlot({ mode: 'profile', targetUser: luckyUser });
  };

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

  const openEventPanel = (eventSlug: string) => {
    const targetEvent = activeEvents.find((event) => event.slug === eventSlug);

    if (!targetEvent) {
      return;
    }

    setSelectedUser(null);
    setLuckySlot(null);
    setSelectedEventSlug(targetEvent.slug);
    setEventPass(null);
    setEventActionError(null);
    setEventActionStatus(null);
    mapInstance?.setCenter([
      targetEvent.coordinates.longitude,
      targetEvent.coordinates.latitude,
    ]);
    mapInstance?.setZoom(15);
  };

  const handleRevealEventPass = async () => {
    if (!selectedEvent) {
      return;
    }

    if (!currentUserMapLocation) {
      setEventActionStatus(null);
      setEventActionError('Share your location to reveal the door password within 1 mile of the venue.');
      requestUserLocation(true);
      return;
    }

    setRevealingEventPass(true);
    setEventActionError(null);
    setEventActionStatus(null);
    try {
      const revealedPass = await revealEventPass(selectedEvent.slug, {
        latitude: currentUserMapLocation.approximateLatitude,
        longitude: currentUserMapLocation.approximateLongitude,
      });
      setEventPass(revealedPass);
      setActiveEvents((events) => events.map((event) => event.slug === selectedEvent.slug
        ? {
            ...event,
            joined: true,
            passIconName: revealedPass.iconName,
          }
        : event));
      setEventActionStatus('Door pass revealed.');
    } catch (revealError) {
      setEventActionError(revealError instanceof ApiClientError
        ? revealError.message
        : 'Unable to reveal the door pass right now.');
    } finally {
      setRevealingEventPass(false);
    }
  };

  const handleEmailEventPass = async () => {
    if (!selectedEvent) {
      return;
    }

    setEmailingEventPass(true);
    setEventActionError(null);
    setEventActionStatus(null);
    try {
      await emailEventPass(selectedEvent.slug);
      setEventActionStatus('Pass JPG sent to the email you signed up with.');
    } catch (emailError) {
      setEventActionError(emailError instanceof Error ? emailError.message : 'Unable to email the pass JPG right now.');
    } finally {
      setEmailingEventPass(false);
    }
  };

  const handleJoinEventChat = async () => {
    if (!selectedEvent) {
      return;
    }

    setJoiningEventChat(true);
    setEventActionError(null);
    setEventActionStatus(null);
    try {
      const joinedChat = await joinEventChat(selectedEvent.slug);
      setActiveEvents((events) => events.map((event) => event.slug === selectedEvent.slug
        ? {
            ...event,
            joined: true,
            conversationId: joinedChat.conversationId,
          }
        : event));
      navigate(`/chat/group/${joinedChat.conversationId}`);
    } catch (joinError) {
      setEventActionError(joinError instanceof Error ? joinError.message : 'Unable to join the party group chat right now.');
    } finally {
      setJoiningEventChat(false);
    }
  };

  const mapMarkers = useMemo<MapMarker[]>(() => {
    const nearbyMarkers = displayedUsers.map((user) => {
      return {
        id: user.id,
        kind: 'person',
        displayName: user.name,
        approximateLatitude: user.lat,
        approximateLongitude: user.lng,
        lastActiveLabel: user.lastActive,
        photo: user.photo,
        badge: createMapMarkerBadge(user.position, user.hostingTravel),
        animationHint: user.animationHint,
        displayMode: user.displayMode,
        privacyRadiusMeters: user.privacyRadiusMeters,
        npcGhostDemo: user.npcGhostDemo,
        relationship: user.relationship?.mutualCruush
          ? {
              kind: 'mutual_cruush',
              precision: user.relationship.precision,
              canMessage: user.relationship.canMessage,
            }
          : null,
      };
    });

    const eventMarkers = activeEvents.map((event) => ({
      id: `event-${event.slug}`,
      kind: 'event' as const,
      displayName: event.venueName,
      approximateLatitude: event.coordinates.latitude,
      approximateLongitude: event.coordinates.longitude,
      lastActiveLabel: 'launch party',
      event: {
        slug: event.slug,
        venueName: event.venueName,
        attendeeCount: event.attendeeCount,
        raUrl: event.raUrl,
        iconAsset: event.iconAsset,
      },
    }));

    if (!currentUserMapLocation) {
      return [...nearbyMarkers, ...eventMarkers];
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
        displayMode: privacySettings.ghostModeEnabled ? 'GHOST' : 'PRECISE',
        privacyRadiusMeters: privacySettings.ghostRadiusMeters,
      },
      ...nearbyMarkers,
      ...eventMarkers,
    ];
  }, [activeEvents, currentProfile, currentUserMapLocation, displayedUsers, privacySettings, userApproximateLocation]);

  const focusedMutualMapLocation = useMemo(() => {
    if (!isMutualMapMode || !focusUserId) {
      return null;
    }

    const focusedUser = displayedUsers.find((user) => user.id === focusUserId);

    if (!focusedUser) {
      return null;
    }

    return {
      approximateLatitude: focusedUser.lat,
      approximateLongitude: focusedUser.lng,
      privacyRadiusMeters: focusedUser.privacyRadiusMeters ?? 1,
    };
  }, [displayedUsers, focusUserId, isMutualMapMode]);

  const handleMarkerSelect = (marker: MapMarker) => {
    if (marker.kind === 'event' && marker.event) {
      openEventPanel(marker.event.slug);
      return;
    }

    if (marker.kind === 'cluster' && marker.cluster) {
      const clusteredEvent = activeEvents.find((event) => event.slug === marker.cluster?.id) ?? launchPartyEvent;
      if (clusteredEvent) {
        openEventPanel(clusteredEvent.slug);
      }
      return;
    }

    const selectedMarkerUser = displayedUsers.find((user) => user.id === marker.id);

    if (selectedMarkerUser) {
      handleUserSelect(selectedMarkerUser);
    }
  };

  const handleRecentlyActivePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    recentlyActiveDragRef.current = {
      hasPointerCapture: false,
      isPointerDown: true,
      hasDragged: false,
      pointerId: event.pointerId,
      startScrollLeft: target.scrollLeft,
      startX: event.clientX,
    };
  };

  const handleRecentlyActivePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = recentlyActiveDragRef.current;

    if (!dragState.isPointerDown || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;

    if (Math.abs(deltaX) > 4) {
      dragState.hasDragged = true;

      if (!dragState.hasPointerCapture) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragState.hasPointerCapture = true;
      }
    }

    event.currentTarget.scrollLeft = dragState.startScrollLeft - deltaX;
  };

  const handleRecentlyActivePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = recentlyActiveDragRef.current;

    if (dragState.pointerId === event.pointerId) {
      if (dragState.hasPointerCapture) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }

      dragState.hasPointerCapture = false;
      dragState.isPointerDown = false;
    }
  };

  const handleRecentlyActiveClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!recentlyActiveDragRef.current.hasDragged) {
      return;
    }

    recentlyActiveDragRef.current.hasDragged = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRecentlyActiveWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (isMobile) {
      return;
    }

    const scrollDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    if (scrollDelta === 0) {
      return;
    }

    event.currentTarget.scrollLeft += scrollDelta;
    event.preventDefault();
  };

  return (
    <div
      className={`cruush-map-shell ${isMobile ? 'fixed inset-0' : 'relative'} overflow-hidden overscroll-none bg-background select-none`}
      data-testid="map-home-shell"
    >
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          <linearGradient id="cruush-dl-eye-gradient" x1="0" x2="24" y1="0" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF0072" />
            <stop offset="46%" stopColor="#6F00FF" />
            <stop offset="72%" stopColor="#004BFF" />
            <stop offset="100%" stopColor="#1181FF" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-background/90 via-background/45 to-transparent" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3 pb-12 pt-3"
        data-testid="map-top-chrome"
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col items-start lg:flex-row lg:items-start">
            <h1 className="sr-only">cruush</h1>
            <img
              alt=""
              aria-hidden="true"
              className="h-[6.25rem] w-auto object-contain sm:h-[7.03125rem]"
              draggable={false}
              src={cruushLogo}
            />
            <div className="mt-1 inline-flex rounded-full border border-white/10 bg-background/35 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/72 backdrop-blur-md lg:ml-2 lg:mt-0">
              {isMutualMapMode ? 'Mutual cruushes' : 'NYC beta'}
            </div>
          </div>

          <div
            className="pointer-events-auto mt-0 flex items-center gap-2 rounded-full border border-white/10 bg-background/25 p-1 backdrop-blur-md"
            data-testid="map-top-actions"
          >
            <Button
              type="button"
              onClick={() => navigate('/rewards')}
              aria-label="cruush+ rewards"
              title="cruush+ rewards"
              className="cruush-logo-font rounded-full px-3 text-lg font-normal leading-none tracking-normal normal-case text-white"
              style={{ background: 'var(--cruush-gradient)' }}
            >
              <CruushPlusWord />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFeelingLucky}
              aria-label="Cruise Carousel"
              title="Cruise Carousel"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <CruushIconImage src={luckyIconWhite} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/privacy/ghost-mode')}
              aria-label="Ghost Mode Settings"
              title="Ghost Mode Settings"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <CruushIconImage src={privacySettings.ghostModeEnabled ? ghostIconColored : ghostIconWhite} className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/privacy/dl-mode')}
              aria-label="DL Mode Settings"
              title="DL Mode Settings"
              className="rounded-full text-white/90 hover:bg-white/10"
            >
              <Eye className="h-5 w-5" style={dlModeEyeStyle} strokeWidth={2.35} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              title="Notifications"
              className="relative rounded-full text-white/90 hover:bg-white/10"
            >
              <CruushIconImage src={notificationsIconWhite} />
              {notificationUnreadCount > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.62rem] font-semibold leading-none text-primary-foreground">
                  {notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}
                </span>
              ) : null}
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
        <Suspense
          fallback={(
            <div className="relative h-full min-h-[400px] w-full overflow-hidden bg-background">
              <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md bg-background/82 px-3 py-2 text-xs text-white/70 backdrop-blur-md">
                Loading NYC map...
              </div>
            </div>
          )}
        >
          <MapView
            onPinClick={handleMarkerSelect}
            onMapClick={() => {
              setSelectedUser(null);
              setSelectedEventSlug(null);
            }}
            markers={mapMarkers}
            fitToMarkers={!currentUserMapLocation && !isMutualMapMode && !focusUserId}
            focusCoordinates={focusedMutualMapLocation ?? currentUserMapLocation}
            denseVenue={denseVenue}
            radiusCircle={privacySettings.ghostModeEnabled && currentUserMapLocation
              ? {
                  center: currentUserMapLocation,
                  radiusMeters: privacySettings.ghostRadiusMeters,
                }
              : null}
            onMapReady={(map) => setMapInstance(map)}
          />
        </Suspense>
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

        {!isMobile && luckySlot ? (
          <CruiseCarouselSlot
            key={`map-lucky-${luckySlot.mode}-${luckySlot.nonce}`}
            mode={luckySlot.mode}
            targetUser={luckySlot.mode === 'profile' ? luckySlot.targetUser : null}
            variant="panel"
            onClose={() => setLuckySlot(null)}
            onComplete={luckySlot.mode === 'profile'
              ? () => {
                  setSelectedUser(luckySlot.targetUser);
                  setLuckySlot(null);
                }
              : undefined}
            onRetry={handleFeelingLucky}
            onUpgrade={() => navigate('/rewards')}
          />
        ) : null}

        {!isMobile && selectedUser && !luckySlot ? (
          <MapProfilePopup
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            fixed={selectedUser.isCurrentUser === true}
            isOwnProfile={selectedUser.isCurrentUser === true}
            onBlockedUser={handleBlockedUser}
          />
        ) : null}

        {selectedEvent ? (
          <div
            className={`pointer-events-auto absolute z-40 rounded-xl border border-white/10 bg-black/88 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
              isMobile
                ? 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-3 right-3'
                : 'left-4 top-24 w-[22rem]'
            }`}
            role="dialog"
            aria-label={`${selectedEvent.venueName} launch party`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Beta launch</p>
                <h2 className="mt-1 text-lg text-white">{selectedEvent.venueName}</h2>
                <p className="mt-1 text-sm text-white/62">{selectedEvent.address}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close launch party details"
                onClick={() => setSelectedEventSlug(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/58">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1">
                {selectedEvent.attendeeCount} joined
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1">
                1 mile reveal radius
              </span>
            </div>

            <a
              className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200"
              href={selectedEvent.raUrl}
              rel="noreferrer"
              target="_blank"
            >
              RA event
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.045] p-3">
              {visibleEventPassIconName ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/52">Door pass</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-400/10">
                      <CruushIcon name={visibleEventPassIconName} variant="colored" className="h-9 w-9" />
                    </span>
                    <div>
                      <p className="text-sm text-white">Show this icon at the door.</p>
                      <p className="mt-0.5 text-xs text-white/55">{visibleEventPassIconName}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 rounded-lg border border-white/10 bg-white/8 text-white hover:bg-white/12"
                      onClick={handleEmailEventPass}
                      disabled={emailingEventPass}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      {emailingEventPass ? 'Emailing...' : 'Email JPG'}
                    </Button>
                    <Button
                      type="button"
                      className="h-10 rounded-lg text-white"
                      style={{ background: 'var(--cruush-gradient)' }}
                      onClick={handleJoinEventChat}
                      disabled={joiningEventChat}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      {joiningEventChat ? 'Joining...' : 'Join chat'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-white">
                    The door password will be revealed when you are within 1 mile of the venue.
                  </p>
                  <Button
                    type="button"
                    className="mt-3 h-10 w-full rounded-lg text-white"
                    style={{ background: 'var(--cruush-gradient)' }}
                    onClick={handleRevealEventPass}
                    disabled={revealingEventPass}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {revealingEventPass
                      ? 'Checking distance...'
                      : currentUserMapLocation
                      ? 'Reveal door pass'
                      : 'Share location to reveal'}
                  </Button>
                </div>
              )}

              {eventActionStatus ? (
                <p className="mt-3 text-xs text-emerald-300">{eventActionStatus}</p>
              ) : null}
              {eventActionError ? (
                <p className="mt-3 text-xs text-destructive">{eventActionError}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className="pointer-events-auto absolute right-3 top-20 z-30 flex flex-col items-end gap-2 sm:right-4"
          data-testid="map-right-actions"
        >
          {activeCrowdNotice ? (
            <div className="inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-background/68 px-3 text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur-md">
              <CruushIconImage src={crowdIconColored} className="h-4 w-4" />
              {activeCrowdNotice}
            </div>
          ) : null}

          {privacySettings.ghostModeEnabled ? (
            <div className="inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-background/68 px-3 text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur-md">
              <CruushIconImage src={ghostIconColored} className="h-4 w-4" />
              Ghost Mode Active
            </div>
          ) : null}

          {dlModeActive ? (
            <div className="inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-background/68 px-3 text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur-md">
              <Eye className="h-4 w-4" style={dlModeEyeStyle} strokeWidth={2.35} />
              DL Mode Active
            </div>
          ) : null}

          <Button
            className={`h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.18em] shadow-[0_12px_35px_rgba(0,0,0,0.25)] ${
              hasActiveFilters
                ? 'border-white/15 text-white'
                : 'border-white/10 bg-background/68 text-white backdrop-blur-md hover:bg-white/10'
            }`}
            style={hasActiveFilters ? { background: 'var(--cruush-gradient)' } : undefined}
            onClick={() => setIsFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {isMutualMapMode ? 'MUTUALS' : 'SEEKING'}
          </Button>

          <Button
            type="button"
            onClick={() => {
              setVisibilityError(null);
              setIsVisibilityOpen(true);
            }}
            className={`h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.18em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] has-[>img]:px-3 ${
              hasActiveVisibility
                ? 'border-white/15'
                : 'border-white/10 bg-background/68 backdrop-blur-md hover:bg-white/10'
            }`}
            style={hasActiveVisibility ? { background: 'var(--cruush-gradient)' } : undefined}
          >
            <CruushIconImage src={hasActiveVisibility ? crowdIconColored : crowdIconWhite} className="mr-2 h-4 w-4" />
            VISIBILITY
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
          <div
            className={`pointer-events-none absolute ${
              isMobile
                ? 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 px-0'
                : shouldAlignRecentlyActiveWithPreview
                ? 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-[calc(23rem+1.5rem)] right-4 z-30 pl-2 pr-0'
                : 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-0 right-4 z-30 pl-4 pr-0'
            }`}
          >
            <div
              className={`mx-auto ${
                isRecentlyActiveOpen
                  ? isMobile
                    ? 'w-full max-w-full rounded-2xl border border-white/10 bg-background/50 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl'
                    : 'w-fit max-w-[29.5rem] rounded-2xl border border-white/10 bg-background/40 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl'
                  : 'max-w-max p-0'
              } ${!isMobile ? 'lg:ml-auto lg:mr-0' : ''} pointer-events-auto`}
              data-testid="recently-active-panel"
            >
              <div className={`flex ${isMobile ? 'justify-center' : 'justify-end'} ${isRecentlyActiveOpen ? 'mb-2' : 'mb-0'}`}>
                <button
                  type="button"
                  aria-controls="recently-active-tray"
                  aria-expanded={isRecentlyActiveOpen}
                  aria-label={isRecentlyActiveOpen ? 'Hide recently active bar' : 'Show recently active bar'}
                  className="h-8 rounded-full border border-white/10 px-4 text-[11px] uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.32)] transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65"
                  onClick={() => setIsRecentlyActiveOpen((open) => !open)}
                  style={{
                    background: isRecentlyActiveOpen ? 'var(--cruush-gradient)' : 'rgba(0,0,0,0.82)',
                  }}
                >
                  Recently Active
                </button>
              </div>
              {isRecentlyActiveOpen ? (
                <div
                  id="recently-active-tray"
                  aria-label="Recently active profiles"
                  className={`${isMobile ? 'gap-2' : 'gap-3'} flex cursor-grab overflow-x-auto overscroll-x-contain scroll-smooth scrollbar-hide active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65`}
                  data-testid="recently-active-tray"
                  onClickCapture={handleRecentlyActiveClickCapture}
                  onPointerCancel={handleRecentlyActivePointerEnd}
                  onPointerDown={handleRecentlyActivePointerDown}
                  onPointerMove={handleRecentlyActivePointerMove}
                  onPointerUp={handleRecentlyActivePointerEnd}
                  onWheel={handleRecentlyActiveWheel}
                  tabIndex={0}
                >
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
                      className={`${isMobile ? 'w-16' : 'w-20'} group block flex-shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65`}
                      data-testid={`recently-active-tile-${user.id}`}
                    >
                      <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] transition-transform group-hover:scale-[1.02]">
                        {user.photo ? (
                          <img
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover"
                            draggable={false}
                            src={resolveMediaUrl(user.photo)}
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            className="flex h-full w-full items-center justify-center"
                            style={{ background: getProfileGradientCss(user.id) }}
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
          hasCruushPlus={hasCruushPlus}
          onChange={handleVisibilityChange}
          onClear={handleClearVisibility}
          onApply={handleApplyVisibility}
        />
      </div>
    </div>
  );
}
