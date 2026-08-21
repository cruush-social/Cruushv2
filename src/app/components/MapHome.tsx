// Vite env type declaration for TypeScript
/// <reference types="vite/client" />
import type { MouseEvent, PointerEvent, WheelEvent } from 'react';
import { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ExternalLink, Filter, Mail, MapPin, MessageCircle, Radio, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { useIsMobile } from './ui/use-mobile';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import CruushPlusWord from './CruushPlusWord';
import MapProfilePopup from './MapProfilePopup';
import CruiseCarouselSlot from './CruiseCarouselSlot';
import MapSidePanel, { type MapSidePanelView } from './MapSidePanel';
import MapFiltersSurface, { DEFAULT_FILTER_STATE, type FilterState } from './MapFiltersSurface';
import MapVisibilitySurface, { DEFAULT_VISIBILITY_STATE, type VisibilityControlState } from './MapVisibilitySurface';
import MapPingSheet from './MapPingSheet';
import MapControlsTutorial, {
  getStoredMapControlsTutorialStep,
  MAP_CONTROLS_TUTORIAL_STORAGE_KEY,
  notifyMapControlsTutorialCompleted,
  type MapControlsTutorialStepId,
} from './MapControlsTutorial';
import { getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';
import { getMutualCruushMap, type MutualCruushActivityItem } from '../lib/cruushApi';
import { DEFAULT_PRIVACY_SETTINGS, getMyPrivacySettings, type PrivacySettings } from '../lib/privacyApi';
import { CRUUSH_PLUS_CHANGED_EVENT, getMyBillingStatus, type BillingStatus } from '../lib/billingApi';
import { addCruushChangedListener } from '../lib/cruushEvents';
import { addNotificationsChangedListener, getNotificationSummary } from '../lib/notificationsApi';
import { enablePushNotifications } from '../lib/pushNotifications';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';
import { emailEventPass, getActiveEvents, joinEventChat, revealEventPass, type EventPassReveal, type LaunchEvent } from '../lib/eventsApi';
import type { DenseVenueConfig } from '../lib/denseVenueMarkers';
import { getProfileGradientCss } from '../lib/profileGradient';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto, setDlModeEnabled } from '../lib/dlMode';
import { markNoticeDismissed, resolveNoticeDismissal } from '../lib/userNoticesApi';
import { syncMyLocation, type ProfileLocationPayload, type ProfileLocationRecord } from '../lib/locationApi';
import {
  getMapPingStatus,
  sendMapPing,
  type MapPingRadiusMiles,
  type MapPingStatus,
} from '../lib/mapPingsApi';
import {
  emptyProfilePayload,
  addProfileChangedListener,
  getMyProfile,
  saveMyProfile,
  saveMyVisibilityRules,
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
import { registerBugButtonSlot } from '../lib/bugButtonSlot';
import { createMapMarkerBadge, type CruushMapInstance, type MapMarker } from '../lib/mapMarkers';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import crowdIconColored from '../assets/ui-icons/crowds-colored.svg';
import crowdIconWhite from '../assets/ui-icons/crowds-white.svg';
import luckyIconWhite from '../assets/ui-icons/lucky-white.png';
import notificationsIconWhite from '../assets/ui-icons/notifications-white.png';
import settingsIconWhite from '../assets/ui-icons/settings-white.png';
import dlModeColored from '../assets/ui-icons/dl-mode-colored.png';
import dlModeWhite from '../assets/ui-icons/dl-mode-white.png';

const DISCOVERY_MAP_LIMIT = 500;
const MAP_PRIVACY_REFRESH_INTERVAL_MS = 10_000;
const CROWD_NOTICE_ORDER = ['Dyke', 'Gay', 'T4T'];
const CROWD_NOTICE_LABELS: Record<string, string> = {
  Dyke: 'Dyke',
  Gay: 'Gay',
  T4T: 'T4T',
};
const MAP_VIEWPORT_RESTORE_STORAGE_KEY = 'cruush:map-viewport-restore';
const MAP_PING_STATUS_REFRESH_INTERVAL_MS = 20_000;
const MAP_PING_IDEMPOTENCY_RETRY_WINDOW_MS = 10 * 60 * 1000;
const MAP_PROFILE_PANEL_BREAKPOINT = 1120;
const MAP_PROFILE_PANEL_MIN_HEIGHT = 720;

type MobileVisualViewportBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
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

function roundViewportValue(value: number) {
  return Math.round(value * 100) / 100;
}

function readMobileVisualViewportBounds(enabled: boolean): MobileVisualViewportBounds | null {
  if (!enabled || typeof window === 'undefined') {
    return null;
  }

  const viewport = window.visualViewport;
  if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  return {
    height: roundViewportValue(viewport.height),
    left: roundViewportValue(Math.max(0, viewport.offsetLeft)),
    top: roundViewportValue(Math.max(0, viewport.offsetTop)),
    width: roundViewportValue(viewport.width),
  };
}

function visualViewportBoundsMatch(
  first: MobileVisualViewportBounds | null,
  second: MobileVisualViewportBounds | null,
) {
  return first?.height === second?.height
    && first?.left === second?.left
    && first?.top === second?.top
    && first?.width === second?.width;
}

function useMobileVisualViewportBounds(enabled: boolean) {
  const [bounds, setBounds] = useState<MobileVisualViewportBounds | null>(() => (
    readMobileVisualViewportBounds(enabled)
  ));

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    if (!enabled || !viewport) {
      setBounds(null);
      return;
    }

    const updateBounds = () => {
      const nextBounds = readMobileVisualViewportBounds(true);
      setBounds((currentBounds) => (
        visualViewportBoundsMatch(currentBounds, nextBounds) ? currentBounds : nextBounds
      ));
    };

    updateBounds();
    viewport.addEventListener('resize', updateBounds);
    viewport.addEventListener('scroll', updateBounds);

    return () => {
      viewport.removeEventListener('resize', updateBounds);
      viewport.removeEventListener('scroll', updateBounds);
    };
  }, [enabled]);

  return bounds;
}

function hasActiveSeekingFilters(filters: FilterState) {
  return filters.ageRange[0] !== DEFAULT_FILTER_STATE.ageRange[0] ||
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

async function decryptOwnerGhostLocation(
  location: ProfileRecord['location'] | ProfileLocationRecord | null | undefined,
): Promise<ApproximateCoordinates | null> {
  if (!location?.ghost_display_location_token) {
    return null;
  }

  const displayPayload = await decryptDisplayLocationToken(location.ghost_display_location_token);

  if (displayPayload.displayMode !== 'GHOST') {
    return null;
  }

  return {
    approximateLatitude: displayPayload.latitude,
    approximateLongitude: displayPayload.longitude,
    privacyRadiusMeters: displayPayload.accuracyDisplayM,
  };
}

function profileRecordToOwnDiscoveryUser(profile: ProfileRecord, location: ApproximateCoordinates | null): DiscoveryUser {
  return {
    id: profile.id || 'me',
    name: profile.display_name || 'Your profile',
    display_name: profile.display_name || 'Your profile',
    signal: profile.signal,
    age: profile.year_of_birth ? new Date().getFullYear() - profile.year_of_birth : null,
    pronouns: (profile.pronouns ?? []).join(', ') || 'Ask me',
    lat: location?.approximateLatitude ?? 40.7128,
    lng: location?.approximateLongitude ?? -74.006,
    lastActive: 'Now',
    distance: 'You',
    lookingFor: profile.looking_for ?? [],
    vibes: profile.vibes ?? [],
    scenes: profile.scenes ?? [],
    archetypes: profile.archetypes ?? [],
    position: profile.position ?? [],
    role: profile.role ?? [],
    hostingTravel: profile.hosting_travel ?? [],
    photo: profile.photos?.[0] ?? null,
    photoExplicit: profile.photo_metadata?.[0]?.explicit === true,
    badges: profile.badges ?? [],
    isCurrentUser: true,
  };
}

function mergeSavedCurrentProfile(currentProfile: ProfileRecord | null, savedProfile: ProfileRecord): ProfileRecord {
  return {
    ...emptyProfilePayload,
    ...currentProfile,
    ...savedProfile,
    location: savedProfile.location ?? currentProfile?.location ?? null,
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
    lookingFor: ['Mutual'],
    vibes: item.vibes,
    scenes: [],
    archetypes: [],
    position: [],
    role: [],
    hostingTravel: [],
    photo: item.user.photo,
    photoExplicit: item.user.photoExplicit === true,
    badges: item.user.badges,
    displayMode: item.coordinates?.precision === 'precise' ? 'PRECISE' : 'GHOST',
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
  openSidePanel?: MapSidePanelView;
  centerEventSlug?: string;
  focusUserId?: string;
  seekingFilters?: FilterState;
} | null;

type StoredMapViewport = {
  latitude: number;
  longitude: number;
  zoom: number;
};

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
const EARTH_RADIUS_MILES = 3958.7613;
// Version the tutorial so the repaired interactive tour is shown once to users
// who completed an older, non-interactive version. Settings can explicitly replay it.
export const MAP_CONTROLS_INTRO_STORAGE_KEY = MAP_CONTROLS_TUTORIAL_STORAGE_KEY;

export function readStoredMapViewport() {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawViewport = window.sessionStorage.getItem(MAP_VIEWPORT_RESTORE_STORAGE_KEY);

  if (!rawViewport) {
    return null;
  }

  let parsedViewport: StoredMapViewport | null = null;

  try {
    const candidateViewport = JSON.parse(rawViewport) as StoredMapViewport;

    if (
      Number.isFinite(candidateViewport.latitude) &&
      Number.isFinite(candidateViewport.longitude) &&
      Number.isFinite(candidateViewport.zoom)
    ) {
      parsedViewport = candidateViewport;
    }
  } catch {
    // Ignore malformed restore payloads and keep the default map camera.
  }

  window.sessionStorage.removeItem(MAP_VIEWPORT_RESTORE_STORAGE_KEY);
  return parsedViewport;
}

export function storeMapViewportForRestore(map: CruushMapInstance | null) {
  if (typeof window === 'undefined' || !map) {
    return;
  }

  const viewportMap = map as CruushMapInstance & {
    getCenter?: () => { lat: number; lng: number };
    getZoom?: () => number;
  };
  const center = viewportMap.getCenter?.();
  const zoom = viewportMap.getZoom?.();

  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) || !Number.isFinite(zoom)) {
    return;
  }

  window.sessionStorage.setItem(
    MAP_VIEWPORT_RESTORE_STORAGE_KEY,
    JSON.stringify({
      latitude: center.lat,
      longitude: center.lng,
      zoom,
    } satisfies StoredMapViewport),
  );
}

function toRadians(degrees: number) {
  return degrees * Math.PI / 180;
}

function distanceMilesBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRevealEventPassErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.code === 'EVENT_RADIUS_REQUIRED') {
    return error.message;
  }

  return 'Unable to reveal the door pass right now. Try again in a moment.';
}

function getJoinEventChatErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.status === 409) {
    return error.message;
  }

  return 'Unable to join the party chat right now. Try again in a moment.';
}

const KEEP_BROWSING_SUFFIX = 'You can keep browsing the NYC beta map.';
const LOCATION_SYNC_ERROR_MESSAGE = "We found your location, but couldn't update your map location. Try again.";

function getGeolocationErrorMessage(error: GeolocationPositionError | undefined) {
  switch (error?.code) {
    case 1:
      return `Location permission was not granted. ${KEEP_BROWSING_SUFFIX}`;
    case 2:
      return `We couldn't pin down your location. Check that location services are on for your browser, then try again. ${KEEP_BROWSING_SUFFIX}`;
    case 3:
      return `Finding your location took too long. Try again in a moment. ${KEEP_BROWSING_SUFFIX}`;
    default:
      return `We couldn't get your location right now. ${KEEP_BROWSING_SUFFIX}`;
  }
}

function getBrowserPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        // iOS can reject a fresh high-accuracy fix indoors even while a recent
        // lower-accuracy browser fix is available. Permission denials never retry.
        if (options.enableHighAccuracy === true && (error.code === 2 || error.code === 3)) {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
          );
          return;
        }

        reject(error);
      },
      options,
    );
  });
}

export default function MapHome(_props: MapHomeProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeState = location.state as MapRouteState;
  const isMobile = useIsMobile();
  const usesFullPageProfile = useIsMobile(MAP_PROFILE_PANEL_BREAKPOINT, MAP_PROFILE_PANEL_MIN_HEIGHT);
  const mobileVisualViewportBounds = useMobileVisualViewportBounds(isMobile);
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [userApproximateLocation, setUserApproximateLocation] = useState<ApproximateCoordinates | null>(null);
  const [ownerGhostMapLocation, setOwnerGhostMapLocation] = useState<ApproximateCoordinates | null>(null);
  const [browserFocusCoordinates, setBrowserFocusCoordinates] = useState<{
    approximateLatitude: number;
    approximateLongitude: number;
  } | null>(null);
  const [restoredMapViewport] = useState<StoredMapViewport | null>(() => readStoredMapViewport());
  const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<CruushMapInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<DiscoveryUser | null>(null);
  const [luckySlot, setLuckySlot] = useState<LuckySlotState | null>(null);
  const [sidePanelView, setSidePanelView] = useState<MapSidePanelView | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isRecentlyActiveOpen, setIsRecentlyActiveOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(() => routeState?.seekingFilters ?? DEFAULT_FILTER_STATE);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityControlState>(DEFAULT_VISIBILITY_STATE);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<ProfileRecord | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [mapPingStatus, setMapPingStatus] = useState<MapPingStatus | null>(null);
  const [mapPingStatusLoading, setMapPingStatusLoading] = useState(true);
  const [mapPingSheetOpen, setMapPingSheetOpen] = useState(false);
  const [mapPingClock, setMapPingClock] = useState(() => Date.now());
  const [activeEvents, setActiveEvents] = useState<LaunchEvent[]>([]);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | null>(null);
  const [eventPass, setEventPass] = useState<EventPassReveal | null>(null);
  const [eventPassCoordinates, setEventPassCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [eventActionError, setEventActionError] = useState<string | null>(null);
  const [eventActionStatus, setEventActionStatus] = useState<string | null>(null);
  const [revealingEventPass, setRevealingEventPass] = useState(false);
  const [emailingEventPass, setEmailingEventPass] = useState(false);
  const [joiningEventChat, setJoiningEventChat] = useState(false);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [mapControlsIntroOpen, setMapControlsIntroOpen] = useState(false);
  const [mapControlsNoticeOffline, setMapControlsNoticeOffline] = useState(false);
  const tutorialNoticeRequestKeyRef = useRef<string | null>(null);
  const hasFetchedInitialUsersRef = useRef(false);
  const hasRequestedInitialLocationRef = useRef(false);
  const lastOwnProfilePanelRequestKeyRef = useRef<string | null>(null);
  const lastEventCenterRequestKeyRef = useRef<string | null>(null);
  const latestLocationSyncRef = useRef<Promise<unknown> | null>(null);
  const mapPingStatusRequestIdRef = useRef(0);
  const pendingMapPingRequestRef = useRef<{ idempotencyKey: string; createdAt: number } | null>(null);
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
  const lastMutualMapModeRef = useRef(isMutualMapMode);
  const shouldReplayTutorial = searchParams.get('replayTutorial') === '1';
  const focusUserId = searchParams.get('focusUserId') ?? routeState?.focusUserId ?? null;
  const shouldOpenOwnProfilePanel = !usesFullPageProfile && routeState?.openOwnProfilePanel === true;
  const requestedSidePanelView = usesFullPageProfile ? null : routeState?.openSidePanel ?? null;

  useEffect(() => {
    if (requestedSidePanelView) {
      setSidePanelView(requestedSidePanelView);
    }
  }, [requestedSidePanelView]);

  useEffect(() => {
    if (usesFullPageProfile && sidePanelView) {
      setSidePanelView(null);
    }
  }, [sidePanelView, usesFullPageProfile]);
  const hasCruushPlus = billingStatus?.cruushPlus === true;

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const profilePanelOpen = !usesFullPageProfile && Boolean(selectedUser && !luckySlot);

    if (profilePanelOpen) {
      document.documentElement.setAttribute('data-cruush-map-profile-panel', 'open');
    } else {
      document.documentElement.removeAttribute('data-cruush-map-profile-panel');
    }

    return () => {
      document.documentElement.removeAttribute('data-cruush-map-profile-panel');
    };
  }, [luckySlot, selectedUser, usesFullPageProfile]);


  const syncApproximateMapLocation = (
    approximateLocation: ApproximateCoordinates,
    syncReason?: ProfileLocationPayload['sync_reason'],
  ) => {
    const syncPromise = syncMyLocation({
      lat: approximateLocation.approximateLatitude,
      lng: approximateLocation.approximateLongitude,
      fuzz_radius_meters: approximateLocation.privacyRadiusMeters,
      ...(syncReason ? { sync_reason: syncReason } : {}),
    })
      .then((syncedLocation) => {
        setCurrentProfile((profile) => profile
          ? (() => {
              const currentLocation = profile.location ?? { id: profile.id, location_updated_at: null };
              const nextLocation = {
                ...currentLocation,
                ...syncedLocation,
              };
              const locationChanged = Object.keys(nextLocation).some((key) => {
                const currentValue = currentLocation[key as keyof typeof currentLocation];
                const nextValue = nextLocation[key as keyof typeof nextLocation];
                return JSON.stringify(currentValue) !== JSON.stringify(nextValue);
              });

              return locationChanged ? { ...profile, location: nextLocation } : profile;
            })()
          : profile);
        void decryptOwnerGhostLocation(syncedLocation)
          .then(setOwnerGhostMapLocation)
          .catch((ghostDisplayError) => {
            console.warn('Error refreshing your Ghost pin:', ghostDisplayError);
            setOwnerGhostMapLocation(null);
          });
      });

    latestLocationSyncRef.current = syncPromise;
    void syncPromise.catch((syncError) => {
      console.warn('Error syncing map location:', syncError);
    });
    return syncPromise;
  };

  const refreshMapPingStatus = useCallback(async () => {
    const requestId = mapPingStatusRequestIdRef.current + 1;
    mapPingStatusRequestIdRef.current = requestId;
    setMapPingStatusLoading(true);
    try {
      const nextStatus = await getMapPingStatus();
      if (mapPingStatusRequestIdRef.current === requestId) {
        setMapPingStatus(nextStatus);
      }
    } finally {
      if (mapPingStatusRequestIdRef.current === requestId) {
        setMapPingStatusLoading(false);
      }
    }
  }, []);

  const dismissMapControlsIntro = () => {
    setMapControlsIntroOpen(false);
    markNoticeDismissed(MAP_CONTROLS_INTRO_STORAGE_KEY, { offline: mapControlsNoticeOffline });
    notifyMapControlsTutorialCompleted();

    if (shouldReplayTutorial) {
      navigate('/map', { replace: true });
    }
  };

  const activateMapTutorialStep = async (step: MapControlsTutorialStepId) => {
    if (step === 'install') {
      window.dispatchEvent(new Event('cruush:install-requested'));
      return;
    }

    if (step === 'notifications') {
      await enablePushNotifications();
      return;
    }

    if (step === 'ping') {
      setMapPingSheetOpen(true);
      return;
    }

    if (step === 'seeking') {
      setIsFiltersOpen(true);
      return;
    }

    if (step === 'visibility') {
      setVisibilityError(null);
      setIsVisibilityOpen(true);
      return;
    }

    if (step === 'crowds') {
      setVisibilityError(null);
      setIsVisibilityOpen(true);
      return;
    }

    if (step === 'ghost') {
      navigate('/privacy/ghost-mode');
      return;
    }

    if (step === 'dl-mode') {
      handleToggleDlMode();
      return;
    }

    if (step === 'feed') {
      navigate('/feed');
      return;
    }

    if (step === 'carousel') {
      handleFeelingLucky();
      return;
    }

    if (step === 'zoom') {
      mapInstance?.zoomIn();
    }
  };

  const followMapTutorialStep = (step: MapControlsTutorialStepId) => {
    if (step === 'ghost') {
      navigate('/privacy/ghost-mode');
      return;
    }

    if (step === 'feed') {
      navigate('/feed');
      return;
    }

    if (step === 'carousel') {
      navigate('/lucky');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadBillingStatus = () => getMyBillingStatus()
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

    void loadBillingStatus();
    window.addEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);

    return () => {
      isMounted = false;
      window.removeEventListener(CRUUSH_PLUS_CHANGED_EVENT, loadBillingStatus);
    };
  }, []);

  useEffect(() => {
    if (!profileLoaded || !currentProfile || typeof window === 'undefined') {
      return;
    }

    const requestKey = `${currentProfile.id}:${shouldReplayTutorial ? 'replay' : 'initial'}`;
    if (tutorialNoticeRequestKeyRef.current === requestKey) {
      return;
    }
    tutorialNoticeRequestKeyRef.current = requestKey;

    let isMounted = true;

    void resolveNoticeDismissal(MAP_CONTROLS_INTRO_STORAGE_KEY).then((notice) => {
      if (!isMounted) {
        return;
      }

      setMapControlsNoticeOffline((currentOffline) => currentOffline === notice.offline ? currentOffline : notice.offline);
      const hasSavedProgress = getStoredMapControlsTutorialStep() !== null;
      const shouldOpen = shouldReplayTutorial || hasSavedProgress || !notice.dismissed;
      setMapControlsIntroOpen((currentOpen) => currentOpen === shouldOpen ? currentOpen : shouldOpen);
    });

    return () => {
      isMounted = false;
    };
  }, [currentProfile?.id, profileLoaded, shouldReplayTutorial]);

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  useEffect(() => addProfileChangedListener((savedProfile) => {
    setCurrentProfile((currentProfile) => mergeSavedCurrentProfile(currentProfile, savedProfile));
    setVisibility(visibilityRulesToState(savedProfile.visibility_rules));
  }), []);

  useEffect(() => {
    let isMounted = true;

    const refresh = async () => {
      try {
        await refreshMapPingStatus();
      } catch (pingError) {
        if (isMounted) {
          console.warn('Error loading map Ping status:', pingError);
        }
      }
    };

    void refresh();
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, MAP_PING_STATUS_REFRESH_INTERVAL_MS);
    const clockIntervalId = window.setInterval(() => setMapPingClock(Date.now()), 1000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshIntervalId);
      window.clearInterval(clockIntervalId);
    };
  }, [refreshMapPingStatus]);

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

    storeMapViewportForRestore(mapInstance);
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

    if (usesFullPageProfile) {
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
    if (usesFullPageProfile && selectedUser) {
      setSelectedUser(null);
    }
    if (isMobile && luckySlot) {
      setLuckySlot(null);
    }
  }, [isMobile, luckySlot, selectedUser, usesFullPageProfile]);

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
          const [displayPayload, ghostLocation] = await Promise.all([
            decryptDisplayLocationToken(profile.location.display_location_token),
            decryptOwnerGhostLocation(profile.location),
          ]);
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
            setOwnerGhostMapLocation(ghostLocation);
          }
        } else {
          const savedProfileLocation = profileLocationToApproximateCoordinates(profile);

          if (savedProfileLocation) {
            initialFetchCoordinates = {
              lat: savedProfileLocation.approximateLatitude,
              lng: savedProfileLocation.approximateLongitude,
            };
            syncApproximateMapLocation(savedProfileLocation);
          }
          if (isMounted) {
            setOwnerGhostMapLocation(null);
          }
        }

        if (isMounted) {
          hasFetchedInitialUsersRef.current = true;
          void fetchUsers(initialFetchCoordinates, hasActiveSeekingFilters(filters) ? filters : undefined);
        }
      })
      .catch((profileError) => {
        console.error('Error loading current profile for map marker:', profileError);
        if (isMounted) {
          setCurrentProfile(null);
          hasFetchedInitialUsersRef.current = true;
          void fetchUsers(null, hasActiveSeekingFilters(filters) ? filters : undefined);
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
    if (!privacySettings.ghostModeEnabled) {
      setOwnerGhostMapLocation(null);
      return undefined;
    }

    const rotationExpiresAtMs = privacySettings.ghostRotationExpiresAtMs;
    if (!rotationExpiresAtMs) {
      return undefined;
    }

    let cancelled = false;
    let retryTimeoutId: number | null = null;
    const refreshOwnerGhostDisplay = async () => {
      try {
        const [profile, loadedPrivacySettings] = await Promise.all([
          getMyProfile(),
          getMyPrivacySettings(),
        ]);
        const ghostLocation = await decryptOwnerGhostLocation(profile.location);

        if (!cancelled) {
          setPrivacySettings(loadedPrivacySettings);
          setOwnerGhostMapLocation(loadedPrivacySettings.ghostModeEnabled ? ghostLocation : null);
        }
      } catch (ghostDisplayError) {
        console.warn('Error rotating your Ghost pin:', ghostDisplayError);
        if (!cancelled) {
          retryTimeoutId = window.setTimeout(refreshOwnerGhostDisplay, MAP_PRIVACY_REFRESH_INTERVAL_MS);
        }
      }
    };
    const rotationTimeoutId = window.setTimeout(
      refreshOwnerGhostDisplay,
      Math.max(0, rotationExpiresAtMs - Date.now() + 250),
    );

    return () => {
      cancelled = true;
      window.clearTimeout(rotationTimeoutId);
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [privacySettings.ghostModeEnabled, privacySettings.ghostRotationExpiresAtMs]);

  useEffect(() => {
    if (!hasFetchedInitialUsersRef.current || lastMutualMapModeRef.current === isMutualMapMode) {
      return;
    }

    lastMutualMapModeRef.current = isMutualMapMode;

    void fetchUsers(getCurrentFetchCoordinates(), filters);
  }, [isMutualMapMode]);

  const discoveryRequestOptions = () => ({
    limit: DISCOVERY_MAP_LIMIT,
  });

  const fetchUsers = async (
    coordinates: { lat: number; lng: number } | null,
    filterParams?: FilterState,
    options: { background?: boolean } = {},
  ) => {
    if (!options.background) {
      setLoading(true);
      setError(null);
    }
    try {
      if (isMutualMapMode) {
        const mutualMapItems = await getMutualCruushMap(filterParams);
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
      if (options.background) {
        // Never keep rendering an expired location token when a privacy refresh
        // cannot reach the server. A foreground retry can restore valid pins.
        setUsers((currentUsers) => currentUsers.filter((user) =>
          user.displayExpiresAtMs == null || user.displayExpiresAtMs > Date.now()));
      } else {
        setUsers([]);
        setError(fetchError instanceof Error ? fetchError.message : isMutualMapMode ? 'Failed to load mutuals.' : 'Failed to load nearby people.');
      }
    } finally {
      if (!options.background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let refreshInFlight = false;

    const refreshPrivacySensitivePins = async () => {
      if (
        refreshInFlight ||
        !hasFetchedInitialUsersRef.current ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      refreshInFlight = true;
      try {
        await fetchUsers(getCurrentFetchCoordinates(), filters, { background: true });
      } finally {
        refreshInFlight = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshPrivacySensitivePins();
      }
    };
    const intervalId = window.setInterval(
      () => void refreshPrivacySensitivePins(),
      MAP_PRIVACY_REFRESH_INTERVAL_MS,
    );

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [filters, isMutualMapMode, userApproximateLocation]);

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
      void fetchUsers(getCurrentFetchCoordinates(), filters);
    });
  }, [filters, isMutualMapMode, userApproximateLocation]);

  const applyBrowserPositionToMap = async (
    position: GeolocationPosition,
    centerAfterUpdate = false,
    syncReason?: ProfileLocationPayload['sync_reason'],
    requireLocationSync = false,
  ) => {
    // Exact browser coordinates stay local here. They are only used as the
    // camera target when recentering yourself; shared map data stays approximate.
    const approximateLocation = approximateDisplayCoordinates({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    const fetchCoordinates = {
      lat: approximateLocation.approximateLatitude,
      lng: approximateLocation.approximateLongitude,
    };
    const browserCoordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    setUserApproximateLocation(approximateLocation);
    const locationSync = syncApproximateMapLocation(approximateLocation, syncReason);
    if (centerAfterUpdate) {
      const exactCameraCoordinates = {
        approximateLatitude: browserCoordinates.latitude,
        approximateLongitude: browserCoordinates.longitude,
      };

      setBrowserFocusCoordinates(exactCameraCoordinates);
      mapInstance?.setCenter([
        browserCoordinates.longitude,
        browserCoordinates.latitude,
      ]);
      mapInstance?.setZoom(14);
    }
    void fetchUsers(fetchCoordinates, hasActiveSeekingFilters(filters) ? filters : undefined);

    if (requireLocationSync) {
      await locationSync;
    }

    setEventPassCoordinates(browserCoordinates);
    setLocationStatus('ready');

    return browserCoordinates;
  };

  const requestUserLocation = (centerAfterUpdate = false) => {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Your browser does not support location sharing.');
      return;
    }

    setLocationStatus('locating');
    const options = {
      enableHighAccuracy: centerAfterUpdate,
      timeout: centerAfterUpdate ? 15000 : 10000,
      maximumAge: centerAfterUpdate ? 0 : 60_000,
    };
    const applyPositionError = (positionError: GeolocationPositionError | Error) => {
      if (positionError instanceof Error && !("code" in positionError)) {
        setLocationStatus('error');
        setLocationError(LOCATION_SYNC_ERROR_MESSAGE);
        return;
      }
      setLocationStatus('error');
      setLocationError(getGeolocationErrorMessage(positionError as GeolocationPositionError));
    };

    if (!centerAfterUpdate) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void applyBrowserPositionToMap(position);
        },
        applyPositionError,
        options,
      );
      return;
    }

    void getBrowserPosition(options)
      .then((position) => applyBrowserPositionToMap(position, centerAfterUpdate, undefined, centerAfterUpdate))
      .catch(applyPositionError);
  };

  const requestFreshEventPassCoordinates = () => new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Your browser does not support location sharing.');
      reject(new Error('Geolocation unavailable.'));
      return;
    }

    setLocationStatus('locating');
    void getBrowserPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
      .then((position) => applyBrowserPositionToMap(position, false, undefined, true))
      .then(resolve)
      .catch((positionError: GeolocationPositionError | Error) => {
        if (positionError instanceof Error && !("code" in positionError)) {
          setLocationStatus('error');
          setLocationError(LOCATION_SYNC_ERROR_MESSAGE);
          reject(new Error(LOCATION_SYNC_ERROR_MESSAGE));
          return;
        }
        const errorMessage = getGeolocationErrorMessage(positionError as GeolocationPositionError);
        setLocationStatus('error');
        setLocationError(errorMessage);
        reject(new Error(errorMessage));
      });
  });

  const requestFreshMapPingLocation = () => new Promise<void>((resolve, reject) => {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Your browser does not support location sharing.');
      reject(new Error('Your browser does not support location sharing.'));
      return;
    }

    setLocationStatus('locating');
    void getBrowserPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
      .then((position) => applyBrowserPositionToMap(position, false, 'PING', true))
      .then(() => resolve())
      .catch((positionError: GeolocationPositionError | Error) => {
        if (positionError instanceof Error && !("code" in positionError)) {
          setLocationStatus('error');
          setLocationError(LOCATION_SYNC_ERROR_MESSAGE);
          reject(new Error(LOCATION_SYNC_ERROR_MESSAGE));
          return;
        }
        const errorMessage = getGeolocationErrorMessage(positionError as GeolocationPositionError);
        setLocationStatus('error');
        setLocationError(errorMessage);
        reject(new Error(errorMessage));
      });
  });

  useEffect(() => {
    const savedProfileLocation = profileLocationToApproximateCoordinates(currentProfile);

    if (
      !profileLoaded ||
      isMutualMapMode ||
      userApproximateLocation ||
      savedProfileLocation ||
      locationStatus !== 'idle' ||
      hasRequestedInitialLocationRef.current
    ) {
      return;
    }

    hasRequestedInitialLocationRef.current = true;
    requestUserLocation();
  }, [currentProfile, isMutualMapMode, locationStatus, profileLoaded, userApproximateLocation]);

  const hasActiveFilters = isMutualMapMode || hasActiveSeekingFilters(filters);

  const availableCrowdModes = getAvailableCrowdModes(currentProfile);
  const safeVisibility: VisibilityControlState = {
    ...visibility,
    activeCrowdModes: visibility.activeCrowdModes.filter((crowd) => availableCrowdModes.includes(crowd)),
  };
  const hasActiveVisibility = hasActiveVisibilityControls(safeVisibility);
  const activeCrowdNotice = formatActiveCrowdNotice(safeVisibility.activeCrowdModes);

  const filteredUsers = users.filter((user) => {
    // The discovery response can include the signed-in user. The map renders
    // the current user separately so Ghost/precise state and the own-location
    // controls stay authoritative; keeping both entries creates two pins for
    // the same account.
    if (currentProfile?.id && user.id === currentProfile.id) {
      return false;
    }

    // Mutual-map Seeking is enforced by the server before display tokens are
    // issued. Do not re-filter its intentionally minimal response fields.
    if (isMutualMapMode) {
      return true;
    }

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
      const savedProfile = await saveMyVisibilityRules(visibilityRules);
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

  const displayedUsers = useMemo(() => {
    if (!focusUserId) {
      return filteredUsers;
    }

    const focusedUser = users.find((user) => user.id === focusUserId);

    if (!focusedUser || filteredUsers.some((user) => user.id === focusUserId)) {
      return filteredUsers;
    }

    return [focusedUser, ...filteredUsers];
  }, [filteredUsers, focusUserId, users]);
  const recentlyActiveUsers = useMemo(() => [...displayedUsers]
    .sort((a, b) => getLastActiveMinutes(a.lastActive) - getLastActiveMinutes(b.lastActive))
    .slice(0, 10), [displayedUsers]);
  const recentlyActiveVisibleCount = Math.min(recentlyActiveUsers.length, 5);
  const recentlyActiveNeedsScroll = recentlyActiveUsers.length > 5;
  const recentlyActiveTrayWidth = isMobile
    ? `${recentlyActiveVisibleCount * 5 + Math.max(0, recentlyActiveVisibleCount - 1) * 0.5}rem`
    : `${recentlyActiveVisibleCount * 6.25 + Math.max(0, recentlyActiveVisibleCount - 1) * 0.75}rem`;
  const savedProfileMapLocation = useMemo(
    () => profileLocationToApproximateCoordinates(currentProfile),
    [currentProfile],
  );
  const currentUserMapLocation = useMemo(
    () => userApproximateLocation ?? savedProfileMapLocation,
    [savedProfileMapLocation, userApproximateLocation],
  );
  const handleSendMapPing = async (radiusMiles: MapPingRadiusMiles) => {
    if (!currentUserMapLocation) {
      throw new Error('Share your map location before sending a Ping.');
    }

    await requestFreshMapPingLocation();

    try {
      await latestLocationSyncRef.current;
    } catch {
      throw new Error('Your map location could not sync. Try again.');
    }

    const now = Date.now();
    const pendingRequest = pendingMapPingRequestRef.current;
    const request = pendingRequest && now - pendingRequest.createdAt < MAP_PING_IDEMPOTENCY_RETRY_WINDOW_MS
      ? pendingRequest
      : { idempotencyKey: crypto.randomUUID(), createdAt: now };
    pendingMapPingRequestRef.current = request;

    const nextStatus = await sendMapPing(radiusMiles, request.idempotencyKey);
    pendingMapPingRequestRef.current = null;
    mapPingStatusRequestIdRef.current += 1;
    setMapPingStatus(nextStatus);
    setMapPingStatusLoading(false);
    setMapPingClock(Date.now());
  };
  const launchPartyEvent = useMemo(
    () => activeEvents.find((event) => event.slug === LAUNCH_EVENT_SLUG) ?? activeEvents[0] ?? null,
    [activeEvents],
  );
  const selectedEvent = useMemo(
    () => activeEvents.find((event) => event.slug === selectedEventSlug) ?? null,
    [activeEvents, selectedEventSlug],
  );
  const selectedEventDistanceMiles = useMemo(() => {
    if (!selectedEvent || !eventPassCoordinates) {
      return null;
    }

    return distanceMilesBetween(
      {
        latitude: eventPassCoordinates.latitude,
        longitude: eventPassCoordinates.longitude,
      },
      {
        latitude: selectedEvent.coordinates.latitude,
        longitude: selectedEvent.coordinates.longitude,
      },
    );
  }, [eventPassCoordinates, selectedEvent]);
  const canRevealSelectedEventPass = selectedEvent && selectedEventDistanceMiles !== null
    ? selectedEventDistanceMiles <= selectedEvent.radiusMiles
    : false;
  const visibleEventPassIconName = canRevealSelectedEventPass ? eventPass?.iconName ?? null : null;
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

    return profileRecordToOwnDiscoveryUser(currentProfile, currentUserMapLocation);
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

  const handleToggleDlMode = () => {
    setDlModeEnabled(!dlModeActive);
  };

  const handleCenterMyLocation = () => {
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

    if (!navigator.geolocation) {
      setEventActionStatus(null);
      setEventActionError('Your browser does not support location sharing.');
      return;
    }

    let passCoordinates: { latitude: number; longitude: number };
    try {
      passCoordinates = await requestFreshEventPassCoordinates();
    } catch (locationRequestError) {
      setEventActionStatus(null);
      setEventActionError(locationRequestError instanceof Error
        ? locationRequestError.message
        : `Share your location to unlock the door pass within ${selectedEvent.radiusMiles} mile of the venue.`);
      return;
    }

    const distanceMiles = distanceMilesBetween(
      {
        latitude: passCoordinates.latitude,
        longitude: passCoordinates.longitude,
      },
      {
        latitude: selectedEvent.coordinates.latitude,
        longitude: selectedEvent.coordinates.longitude,
      },
    );

    if (distanceMiles > selectedEvent.radiusMiles) {
      setEventActionStatus(null);
      setEventActionError(`Door pass unlocks within ${selectedEvent.radiusMiles} mile of the venue.`);
      return;
    }

    setRevealingEventPass(true);
    setEventActionError(null);
    setEventActionStatus(null);
    try {
      const revealedPass = await revealEventPass(selectedEvent.slug, passCoordinates);
      setEventPass(revealedPass);
      setActiveEvents((events) => events.map((event) => event.slug === selectedEvent.slug
        ? {
            ...event,
            joined: true,
          }
        : event));
      setEventActionStatus('Door pass revealed.');
    } catch (revealError) {
      setEventActionError(getRevealEventPassErrorMessage(revealError));
    } finally {
      setRevealingEventPass(false);
    }
  };

  useEffect(() => {
    if (!eventPass?.validUntil) {
      return undefined;
    }

    const validUntilMs = Date.parse(eventPass.validUntil);
    if (!Number.isFinite(validUntilMs)) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setEventPass(null);
    }, Math.max(0, validUntilMs - Date.now() + 500));

    return () => window.clearTimeout(timeout);
  }, [eventPass?.validUntil]);

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

  const handleJoinEventChat = async ({ openChat = true }: { openChat?: boolean } = {}) => {
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
            attendeeCount: event.joined ? event.attendeeCount : event.attendeeCount + 1,
          }
        : event));
      if (openChat) {
        navigate(`/chat/group/${joinedChat.conversationId}`);
      } else {
        setEventActionStatus('You joined. The party chat is in Messages and notifications are off by default.');
      }
    } catch (joinError) {
      setEventActionError(getJoinEventChatErrorMessage(joinError));
    } finally {
      setJoiningEventChat(false);
    }
  };

  const mapMarkers = useMemo<MapMarker[]>(() => {
    const activeReceivedPings = new Map(
      (mapPingStatus?.receivedPings ?? [])
        .filter((ping) => Date.parse(ping.expiresAt) > mapPingClock)
        .map((ping) => [ping.sourceUserId, { id: ping.id, expiresAt: ping.expiresAt }]),
    );
    const nearbyMarkers = displayedUsers
      .filter((user) => !user.isCurrentUser && user.id !== currentProfile?.id && user.id !== 'me')
      .map((user) => {
      const loadedProfilePing = user.activePing && Date.parse(user.activePing.expiresAt) > mapPingClock
        ? user.activePing
        : null;
      return {
        id: user.id,
        userId: user.id,
        kind: 'person',
        displayName: user.name,
        signal: user.signal,
        latestFeedPostPreview: user.latestFeedPostPreview,
        approximateLatitude: user.lat,
        approximateLongitude: user.lng,
        lastActiveLabel: user.lastActive,
        photo: user.photo,
        photoExplicit: user.photoExplicit,
        badge: createMapMarkerBadge(user.position, user.hostingTravel),
        displayMode: user.displayMode,
        privacyRadiusMeters: user.privacyRadiusMeters,
        npcGhostDemo: user.npcGhostDemo,
        activePing: loadedProfilePing ?? activeReceivedPings.get(user.id) ?? null,
        relationship: (user.relationship?.mutualCruush || user.relationshipContext === 'MUTUAL_CRUUSH')
          ? {
              kind: 'mutual_cruush',
              precision: user.relationship?.precision,
              canMessage: user.relationship?.canMessage ?? true,
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

    const currentUserMarker: MapMarker = {
      id: 'me',
      userId: currentProfile?.id ?? 'me',
      displayName: 'You',
      signal: currentProfile?.signal ?? '',
      approximateLatitude: currentUserMapLocation.approximateLatitude,
      approximateLongitude: currentUserMapLocation.approximateLongitude,
      lastActiveLabel: 'Now',
      photo: currentProfile?.photos[0] ?? null,
      photoExplicit: currentProfile?.photo_metadata?.[0]?.explicit === true,
      isCurrentUser: true,
      ownerStealthActive: privacySettings.baseMode === 'STEALTH',
      badge: createMapMarkerBadge(currentProfile?.position ?? []),
      displayMode: 'PRECISE',
      privacyRadiusMeters: privacySettings.ghostRadiusMeters,
      activePing: mapPingStatus?.activePing && Date.parse(mapPingStatus.activePing.expiresAt) > mapPingClock
        ? mapPingStatus.activePing
        : null,
    };
    const ownerGhostMarker: MapMarker | null = privacySettings.ghostModeEnabled && ownerGhostMapLocation
      ? {
          id: 'me-ghost-decoy',
          userId: currentProfile?.id ?? 'me',
          displayName: 'Your Ghost pin',
          signal: 'Ghost Mode decoy',
          approximateLatitude: ownerGhostMapLocation.approximateLatitude,
          approximateLongitude: ownerGhostMapLocation.approximateLongitude,
          lastActiveLabel: 'Now',
          photo: currentProfile?.photos[0] ?? null,
          photoExplicit: currentProfile?.photo_metadata?.[0]?.explicit === true,
          isCurrentUser: true,
          displayMode: 'GHOST',
          privacyRadiusMeters: privacySettings.ghostRadiusMeters,
        }
      : null;

    return [
      currentUserMarker,
      ...(ownerGhostMarker ? [ownerGhostMarker] : []),
      ...nearbyMarkers,
      ...eventMarkers,
    ];
  }, [activeEvents, currentProfile, currentUserMapLocation, displayedUsers, mapPingClock, mapPingStatus, ownerGhostMapLocation, privacySettings]);

  const focusedMapLocation = useMemo(() => {
    if (!focusUserId) {
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
  }, [displayedUsers, focusUserId]);

  const handleMarkerSelect = (marker: MapMarker) => {
    if (marker.kind === 'event' && marker.event) {
      openEventPanel(marker.event.slug);
      return;
    }

    if (marker.kind === 'cluster' && marker.cluster) {
      if (marker.cluster.kind === 'people') {
        return;
      }

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
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Some mobile browsers reject capture after a touch has been cancelled.
        }
        dragState.hasPointerCapture = true;
      }
    }

    event.currentTarget.scrollLeft = dragState.startScrollLeft - deltaX;
  };

  const handleRecentlyActivePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = recentlyActiveDragRef.current;

    if (dragState.pointerId === event.pointerId) {
      if (dragState.hasPointerCapture) {
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
          // The pointer may already have been released by the browser.
        }
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

  const handleMapReady = useCallback((map: CruushMapInstance) => {
    setMapInstance((currentMap) => currentMap === map ? currentMap : map);
  }, []);

  return (
    <div
      className={`cruush-map-shell ${isFiltersOpen || isVisibilityOpen ? 'cruush-map-surface-open' : ''} ${isMobile ? `fixed${mobileVisualViewportBounds ? '' : ' inset-0'}` : 'relative'} overflow-hidden overscroll-none bg-background select-none`}
      data-testid="map-home-shell"
      style={mobileVisualViewportBounds ? {
        height: `${mobileVisualViewportBounds.height}px`,
        left: `${mobileVisualViewportBounds.left}px`,
        maxHeight: `${mobileVisualViewportBounds.height}px`,
        minHeight: `${mobileVisualViewportBounds.height}px`,
        top: `${mobileVisualViewportBounds.top}px`,
        width: `${mobileVisualViewportBounds.width}px`,
      } : undefined}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-background/90 via-background/45 to-transparent" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 px-2 pb-10 pr-[3.75rem] pt-2 sm:px-3 sm:pr-[4.25rem] sm:pt-3 lg:pr-[4.75rem]"
        data-testid="map-top-chrome"
      >
        <div className="relative flex w-full items-start">
          <h1 className="sr-only">cruush</h1>
          {isMutualMapMode ? (
            <div
              className="pointer-events-auto absolute right-0 top-full mt-1 inline-flex max-w-[5.75rem] items-center rounded-full border border-white/10 bg-background/35 px-1.5 py-0.5 text-[8px] lowercase leading-none tracking-[0.08em] text-white/72 backdrop-blur-md sm:max-w-none sm:px-2 sm:text-[9px] sm:tracking-[0.1em]"
              data-testid="map-beta-stack"
            >
              mutuals
            </div>
          ) : null}

          <div
          className="cruush-map-top-actions pointer-events-auto mt-0 flex w-full min-w-0 flex-1 items-center justify-between gap-0 rounded-full border border-white/10 bg-background/25 p-1 backdrop-blur-md transition-[width,margin,transform] sm:gap-1 sm:p-1.5 lg:mx-auto lg:max-w-[52rem] lg:flex-none"
            data-testid="map-top-actions"
          >
            <div className="relative shrink-0" data-testid="map-plus-stack">
              <Button
                type="button"
                onClick={() => navigate('/rewards')}
                aria-label="cruush+ rewards"
                title="cruush+ rewards"
                className="cruush-plus-shimmer-button cruush-logo-font pointer-events-auto h-9 rounded-full px-3 text-base font-normal leading-none tracking-normal normal-case text-white max-[340px]:px-2 max-[340px]:text-sm sm:h-10 sm:px-3.5 sm:text-lg lg:h-11 lg:px-4 lg:text-xl"
                style={{ background: 'var(--cruush-gradient)' }}
              >
                <CruushPlusWord />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFeelingLucky}
              data-tutorial-target="carousel"
              aria-label="Cruise Carousel"
              title="Cruise Carousel"
              className="size-9 rounded-full text-white/90 hover:bg-white/10 sm:size-10 lg:size-11"
            >
              <CruushIconImage src={luckyIconWhite} className="h-[1.375rem] w-[1.375rem] scale-[1.55] sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/privacy/ghost-mode')}
              data-tutorial-target="ghost"
              aria-label="Ghost Mode Settings"
              title="Ghost Mode Settings"
              className="size-9 rounded-full text-white/90 hover:bg-white/10 sm:size-10 lg:size-11"
            >
              <CruushIcon
                name="ghost"
                variant={privacySettings.baseMode === 'STEALTH' ? 'stealth' : privacySettings.ghostModeEnabled ? 'colored' : 'white'}
                className="h-[1.375rem] w-[1.375rem] sm:h-6 sm:w-6 lg:h-7 lg:w-7"
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleDlMode}
              data-tutorial-target="dl-mode"
              aria-label={dlModeActive ? 'Turn DL Mode off' : 'Turn DL Mode on'}
              title={dlModeActive ? 'Turn DL Mode off' : 'Turn DL Mode on'}
              className="size-9 rounded-full text-white/90 hover:bg-white/10 sm:size-10 lg:size-11"
            >
              <CruushIconImage
                src={dlModeActive ? dlModeColored : dlModeWhite}
                className="h-[1.375rem] w-[1.375rem] sm:h-6 sm:w-6 lg:h-7 lg:w-7"
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/notifications')}
              data-tutorial-target="notifications"
              aria-label="Notifications"
              title="Notifications"
              className="relative size-9 rounded-full text-white/90 hover:bg-white/10 sm:size-10 lg:size-11"
            >
              <CruushIconImage src={notificationsIconWhite} className="h-[1.375rem] w-[1.375rem] scale-[1.4] sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
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
                className="size-9 rounded-full text-white/90 hover:bg-white/10 sm:size-10 lg:size-11"
              >
                <CruushIconImage src={settingsIconWhite} className="h-[1.375rem] w-[1.375rem] scale-[1.18] sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
              </Button>
              <div
                className="size-9 shrink-0 sm:size-10 lg:hidden"
                data-bug-button-size="large"
                data-testid="map-bug-button-slot"
                ref={registerBugButtonSlot}
              />
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
            fitToMarkers={!restoredMapViewport && !currentUserMapLocation && !isMutualMapMode && !focusUserId}
            focusCoordinates={
              focusedMapLocation ??
              browserFocusCoordinates ??
              (restoredMapViewport || focusUserId ? undefined : currentUserMapLocation)
            }
            initialViewport={restoredMapViewport ? {
              center: {
                approximateLatitude: restoredMapViewport.latitude,
                approximateLongitude: restoredMapViewport.longitude,
              },
              zoom: restoredMapViewport.zoom,
            } : undefined}
            denseVenue={denseVenue}
            radiusCircle={privacySettings.ghostModeEnabled && currentUserMapLocation
              ? {
                  center: currentUserMapLocation,
                  radiusMeters: privacySettings.ghostRadiusMeters,
                }
              : null}
            ghostLeash={privacySettings.ghostModeEnabled && currentUserMapLocation && ownerGhostMapLocation
              ? {
                  from: currentUserMapLocation,
                  to: ownerGhostMapLocation,
                }
              : null}
            onMapReady={handleMapReady}
          />
        </Suspense>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background/65 to-transparent" />

        {error ? (
          <div className="absolute left-4 right-20 top-[8.75rem] z-20 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
            candidateUsers={displayedUsers}
            targetUser={luckySlot.mode === 'profile' ? luckySlot.targetUser : null}
            variant="panel"
            onClose={() => setLuckySlot(null)}
            onComplete={luckySlot.mode === 'profile'
              ? () => {
                  handleUserSelect(luckySlot.targetUser);
                }
              : undefined}
            onRetry={handleFeelingLucky}
            onUpgrade={() => navigate('/rewards')}
          />
        ) : null}

        {!usesFullPageProfile && sidePanelView ? (
          <MapSidePanel
            view={sidePanelView}
            onViewChange={setSidePanelView}
            onClose={() => setSidePanelView(null)}
          />
        ) : null}

        {!usesFullPageProfile && selectedUser && !luckySlot ? (
          <MapProfilePopup
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            fixed={selectedUser.isCurrentUser === true}
            isOwnProfile={selectedUser.isCurrentUser === true}
            onBlockedUser={handleBlockedUser}
            onProfileSaved={(savedProfile) => {
              const nextProfile = {
                ...emptyProfilePayload,
                ...savedProfile,
              };
              const nextLocation = userApproximateLocation ?? profileLocationToApproximateCoordinates(nextProfile);

              setCurrentProfile(nextProfile);
              setSelectedUser((currentUser) => currentUser?.isCurrentUser === true
                ? profileRecordToOwnDiscoveryUser(nextProfile, nextLocation)
                : currentUser);
            }}
          />
        ) : null}

        {selectedEvent ? (
          <div
            className={`pointer-events-auto absolute z-[45] rounded-xl border border-white/10 bg-black/88 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
              isMobile
                ? 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-3 right-3'
                : 'left-4 top-[8.75rem] w-[22rem]'
            }`}
            role="dialog"
            aria-label={`${selectedEvent.venueName} launch party`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#03ecfc]">Beta launch</p>
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
              className="mt-3 inline-flex items-center gap-2 text-sm text-[#03ecfc] hover:text-[#c9fbff]"
              href={selectedEvent.raUrl}
              rel="noreferrer"
              target="_blank"
            >
              RA event
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {selectedEvent.joined ? (
                <div className="rounded-lg border border-[#03ecfc]/20 bg-[#03ecfc]/10 p-3 text-sm text-[#c9fbff]">
                  You're joining. The party chat is available in Messages and muted by default.
                </div>
              ) : (
                <Button
                  type="button"
                  className="h-10 rounded-lg text-white"
                  style={{ background: 'var(--cruush-gradient)' }}
                  onClick={() => handleJoinEventChat({ openChat: false })}
                  disabled={joiningEventChat}
                >
                  {joiningEventChat ? 'Joining...' : 'Join launch party'}
                </Button>
              )}
              {selectedEvent.joined && selectedEvent.conversationId ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-lg border border-white/10 bg-white/8 text-white hover:bg-white/12"
                  onClick={() => navigate(`/chat/group/${selectedEvent.conversationId}`)}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Open party chat
                </Button>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.045] p-3">
              {visibleEventPassIconName ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/52">Door pass</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-[#03ecfc]/25 bg-[#03ecfc]/10">
                      <CruushIcon name={visibleEventPassIconName} variant="colored" className="h-9 w-9" />
                    </span>
                    <div>
                      <p className="text-sm text-white">Show this icon at the door. It changes every hour.</p>
                      <p className="mt-0.5 text-xs text-white/55">
                        {visibleEventPassIconName}
                        {eventPass?.hourIndex !== undefined ? ` | hour ${eventPass.hourIndex + 1}` : ''}
                      </p>
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
                      onClick={() => {
                        if (selectedEvent.conversationId) {
                          navigate(`/chat/group/${selectedEvent.conversationId}`);
                          return;
                        }
                        void handleJoinEventChat({ openChat: true });
                      }}
                      disabled={joiningEventChat}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      {joiningEventChat ? 'Joining...' : selectedEvent.conversationId ? 'Open chat' : 'Join chat'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-white">
                    The door pass unlocks when you are within {selectedEvent.radiusMiles} mile of the venue.
                  </p>
                  {!eventPassCoordinates ? (
                    <Button
                      type="button"
                      className="mt-3 h-10 w-full rounded-lg text-white"
                      style={{ background: 'var(--cruush-gradient)' }}
                      onClick={() => requestUserLocation(true)}
                      disabled={locationStatus === 'locating'}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      {locationStatus === 'locating' ? 'Checking location...' : 'Share location'}
                    </Button>
                  ) : canRevealSelectedEventPass ? (
                    <Button
                      type="button"
                      className="mt-3 h-10 w-full rounded-lg text-white"
                      style={{ background: 'var(--cruush-gradient)' }}
                      onClick={handleRevealEventPass}
                      disabled={revealingEventPass}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      {revealingEventPass ? 'Checking distance...' : 'Reveal door pass'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-white/8 text-white hover:bg-white/12"
                      onClick={() => requestUserLocation(true)}
                      disabled={locationStatus === 'locating'}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      {locationStatus === 'locating' ? 'Updating location...' : 'Update my location'}
                    </Button>
                  )}
                </div>
              )}

              {eventActionStatus ? (
                <p className="mt-3 text-xs text-[#03ecfc]">{eventActionStatus}</p>
              ) : null}
              {eventActionError ? (
                <p className="mt-3 text-xs text-destructive">{eventActionError}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          // The top offsets clear the top-actions bar by the same 8px the stack
          // uses between its own controls. The bar grows at sm and again at lg
          // (h-9/p-1 -> h-10/p-1.5 -> h-11), so each step needs its own offset:
          // its bottom edge lands at 54px, 66px and 70px.
          className="pointer-events-auto absolute right-3 top-[3.875rem] z-40 flex flex-col items-end gap-2 sm:right-4 sm:top-[4.625rem] lg:top-[4.875rem]"
          data-testid="map-right-actions"
        >
          {activeCrowdNotice ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-full border border-white/15 px-3 text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur-md transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65"
              style={{ background: 'var(--cruush-gradient)' }}
              onClick={() => {
                setVisibilityError(null);
                setIsVisibilityOpen(true);
              }}
            >
              <CruushIconImage src={crowdIconColored} className="h-4 w-4" />
              {activeCrowdNotice}
            </button>
          ) : null}

          <Button
            className={`h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.18em] shadow-[0_12px_35px_rgba(0,0,0,0.25)] ${
              hasActiveFilters
                ? 'border-white/15 text-white'
                : 'border-white/10 bg-background/68 text-white backdrop-blur-md hover:bg-white/10'
            }`}
            style={hasActiveFilters ? { background: 'var(--cruush-gradient)' } : undefined}
            data-testid="map-seeking-button"
            data-tutorial-target="seeking"
            onClick={() => setIsFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {isMutualMapMode ? 'MUTUALS' : 'SEEKING'}
          </Button>

          <Button
            type="button"
            data-testid="map-visibility-button"
            data-tutorial-target="visibility"
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

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMapPingSheetOpen(true)}
            data-testid="map-ping-button"
            data-tutorial-target="ping"
            aria-label="Send a Ping"
            title="Send a Ping"
            className="size-8 shrink-0 rounded-full border border-[#c8ff31]/45 bg-background/45 text-[#c8ff31] backdrop-blur-md hover:bg-[#c8ff31]/15 sm:size-9 lg:size-11"
          >
            <Radio aria-hidden="true" className="h-5 w-5 lg:h-7 lg:w-7" />
          </Button>

          <div
            className="flex flex-col gap-2"
            data-testid="map-zoom-controls"
          >
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
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => mapInstance?.zoomIn()}
              disabled={!mapInstance}
              data-tutorial-target="zoom"
              aria-label="Zoom in on map"
              title="Zoom in on map"
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => mapInstance?.zoomOut()}
              disabled={!mapInstance}
              data-tutorial-target="zoom"
              aria-label="Zoom out on map"
              title="Zoom out on map"
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {displayedUsers.length > 0 && !selectedEvent && (
          <div
            className={`pointer-events-none absolute ${
              isMobile
                ? 'bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 px-0'
                : `bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-30 px-4 ${
                    shouldAlignRecentlyActiveWithPreview ? 'left-[calc(26rem+3rem)]' : 'left-0'
                  } ${sidePanelView ? 'right-[calc(26rem+3rem)]' : 'right-0'}`
            }`}
          >
            <div
              className={`mx-auto ${
                isRecentlyActiveOpen
                  ? `${isMobile ? 'w-fit max-w-full' : 'w-fit max-w-[30rem]'} rounded-2xl border border-white/10 bg-background/68 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-md`
                  : 'max-w-max p-0'
              } pointer-events-auto`}
              data-testid="recently-active-panel"
            >
              <div className={`flex justify-center ${isRecentlyActiveOpen ? 'mb-2' : 'mb-0'}`}>
                <button
                  type="button"
                  aria-controls="recently-active-tray"
                  aria-expanded={isRecentlyActiveOpen}
                  aria-label={isRecentlyActiveOpen ? 'Hide recently active bar' : 'Show recently active bar'}
                  className={`h-9 rounded-full border border-white/10 px-5 text-[11px] uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.32)] backdrop-blur-md transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65 ${
                    isRecentlyActiveOpen ? '' : 'bg-background/68'
                  }`}
                  onClick={() => setIsRecentlyActiveOpen((open) => !open)}
                  style={isRecentlyActiveOpen ? { background: 'var(--cruush-gradient)' } : undefined}
                >
                  Recently Active
                </button>
              </div>
              {isRecentlyActiveOpen ? (
                <div
                  id="recently-active-tray"
                  aria-label="Recently active profiles"
                  className={`${isMobile ? 'gap-2' : 'gap-3'} ${recentlyActiveNeedsScroll ? 'overflow-x-auto pb-2 scrollbar-subtle' : 'overflow-x-hidden'} flex cursor-grab overscroll-x-contain scroll-smooth active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65`}
                  data-testid="recently-active-tray"
                  data-scrollable={recentlyActiveNeedsScroll ? 'true' : 'false'}
                  onClickCapture={handleRecentlyActiveClickCapture}
                  onPointerCancel={handleRecentlyActivePointerEnd}
                  onPointerDown={handleRecentlyActivePointerDown}
                  onPointerMove={handleRecentlyActivePointerMove}
                  onPointerUp={handleRecentlyActivePointerEnd}
                  onWheel={handleRecentlyActiveWheel}
                  style={{ width: recentlyActiveTrayWidth, maxWidth: '100%', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
                  tabIndex={0}
                >
                {recentlyActiveUsers.map((user) => (
                    <button
                      key={user.id}
                      aria-label={`Open ${user.name} profile`}
                      onClick={() => handleUserSelect(user)}
                      className={`${isMobile ? 'w-20' : 'w-[6.25rem]'} group block flex-shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65`}
                      data-testid={`recently-active-tile-${user.id}`}
                    >
                      <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] transition-transform group-hover:scale-[1.02]">
                        {user.photo && !shouldMaskPhoto(dlModeActive, user.photoExplicit) ? (
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
          hasCruushPlus={hasCruushPlus}
          onUpgrade={() => navigate('/rewards')}
          onClear={() => {
            navigate(`${location.pathname}${location.search}`, {
              replace: true,
              state: { ...(routeState ?? {}), seekingFilters: undefined },
            });
            setFilters(DEFAULT_FILTER_STATE);
            void fetchUsers(getCurrentFetchCoordinates(), DEFAULT_FILTER_STATE);
          }}
          onApply={() => {
            navigate(`${location.pathname}${location.search}`, {
              replace: true,
              state: { ...(routeState ?? {}), seekingFilters: filters },
            });
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
          onUpgrade={() => navigate('/rewards')}
        />

        <MapPingSheet
          open={mapPingSheetOpen}
          onOpenChange={setMapPingSheetOpen}
          status={mapPingStatus}
          loading={mapPingStatusLoading}
          hasMapLocation={Boolean(currentUserMapLocation)}
          signal={currentProfile?.signal}
          onSaveSignal={async (signal) => {
            const savedProfile = await saveMyProfile({
              ...emptyProfilePayload,
              ...(currentProfile ?? {}),
              signal,
            });
            setCurrentProfile(savedProfile);
          }}
          onRefresh={refreshMapPingStatus}
          onSend={handleSendMapPing}
          hasCruushPlus={hasCruushPlus}
          onUpgrade={() => navigate('/rewards')}
        />

        <MapControlsTutorial
          open={mapControlsIntroOpen}
          onActivateStep={activateMapTutorialStep}
          onComplete={dismissMapControlsIntro}
          onStepChange={followMapTutorialStep}
        />
      </div>
    </div>
  );
}
