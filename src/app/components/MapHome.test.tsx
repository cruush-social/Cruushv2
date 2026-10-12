import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from '../lib/apiClient';
import type { PlaceRecord } from '../lib/placesApi';
import {
  PLACE_FACILITY_LABELS,
  PLACE_FACILITY_TYPES,
  getSpotCategoryLabels,
  getVisibleSpotTags,
} from '../lib/places';
import MapHome, {
  MileHighClubBrowseLimit,
  canUseDeveloperMapToolsEmail,
  getAllPlacesForMap,
  isCoordinateInViewport,
  SPOT_MAP_VIEW_LIMIT,
} from './MapHome';
import { MapServiceAreaProvider, useMapServiceArea } from './MapServiceAreaContext';

const { getNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
}));

const { getPlaces } = vi.hoisted(() => ({
  getPlaces: vi.fn(),
}));

const { getMutualCruushMap } = vi.hoisted(() => ({
  getMutualCruushMap: vi.fn(),
}));

const { revokeMutualCruush, revokeSentCruush, sendCruush } = vi.hoisted(() => ({
  revokeMutualCruush: vi.fn(),
  revokeSentCruush: vi.fn(),
  sendCruush: vi.fn(),
}));

const {
  applyMyVisibilitySet,
  deleteMyVisibilitySet,
  getMyProfile,
  getMyVisibilitySets,
  getProfileById,
  saveMyVisibilityRules,
  saveMyVisibilitySet,
  updateMyVisibilitySet,
} = vi.hoisted(() => ({
  applyMyVisibilitySet: vi.fn(),
  deleteMyVisibilitySet: vi.fn(),
  getMyProfile: vi.fn(),
  getMyVisibilitySets: vi.fn(),
  getProfileById: vi.fn(),
  saveMyVisibilityRules: vi.fn(),
  saveMyVisibilitySet: vi.fn(),
  updateMyVisibilitySet: vi.fn(),
}));

const { blockUser } = vi.hoisted(() => ({
  blockUser: vi.fn(),
}));

const { createReport } = vi.hoisted(() => ({
  createReport: vi.fn(),
}));

const { decryptDisplayLocationToken } = vi.hoisted(() => ({
  decryptDisplayLocationToken: vi.fn(),
}));

const { getMyPrivacySettings } = vi.hoisted(() => ({
  getMyPrivacySettings: vi.fn(),
}));

const { getMyTravelPin } = vi.hoisted(() => ({
  getMyTravelPin: vi.fn(),
}));

const { getMyMapSpotsVisibility, saveMyMapSpotsVisibility } = vi.hoisted(() => ({
  getMyMapSpotsVisibility: vi.fn(),
  saveMyMapSpotsVisibility: vi.fn(),
}));

const { syncMyLocation } = vi.hoisted(() => ({
  syncMyLocation: vi.fn(),
}));

const { getMapPingStatus, sendMapPing } = vi.hoisted(() => ({
  getMapPingStatus: vi.fn(),
  sendMapPing: vi.fn(),
}));

const { enablePushNotifications } = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
}));

const { getMyBillingStatus } = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
}));

const { getActiveEvents, revealEventPass, emailEventPass, joinEventChat } = vi.hoisted(() => ({
  getActiveEvents: vi.fn(),
  revealEventPass: vi.fn(),
  emailEventPass: vi.fn(),
  joinEventChat: vi.fn(),
}));

const { useIsMobile } = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
}));

const { mapControls } = vi.hoisted(() => ({
  mapControls: {
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 40.73, lng: -73.97 })),
    getZoom: vi.fn(() => 13.75),
  },
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const { dismissUserNotice, getUserNoticeDismissal, markNoticeDismissed, resolveNoticeDismissal } = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
  markNoticeDismissed: vi.fn(),
  resolveNoticeDismissal: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

vi.mock('../lib/usersApi', () => ({
  getNearbyUsers,
  // The component narrows on this class, so the mock has to carry it or the
  // instanceof check throws inside the catch it was meant to guard.
  OutsideBrowseRadiusError: class OutsideBrowseRadiusError extends Error {},
  OutsideServiceAreaError: class OutsideServiceAreaError extends Error {},
}));

vi.mock('../lib/placesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/placesApi')>('../lib/placesApi');
  return { ...actual, getPlaces };
});

vi.mock('../lib/cruushApi', () => ({
  getMutualCruushMap,
  revokeMutualCruush,
  revokeSentCruush,
  sendCruush,
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');
  return {
    ...actual,
    applyMyVisibilitySet,
    deleteMyVisibilitySet,
    getMyProfile,
    getMyVisibilitySets,
    getProfileById,
    saveMyVisibilityRules,
    saveMyVisibilitySet,
    updateMyVisibilitySet,
  };
});

vi.mock('../lib/blockApi', () => ({
  blockUser,
}));

vi.mock('../lib/reportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/reportApi')>('../lib/reportApi');
  return { ...actual, createReport };
});

vi.mock('../lib/displayLocationTokens', () => ({
  decryptDisplayLocationToken,
}));

vi.mock('../lib/privacyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/privacyApi')>('../lib/privacyApi');
  return {
    ...actual,
    getMyPrivacySettings,
    getMyTravelPin,
    getMyMapSpotsVisibility,
    saveMyMapSpotsVisibility,
  };
});

vi.mock('../lib/locationApi', () => ({
  syncMyLocation,
}));

vi.mock('../lib/mapPingsApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/mapPingsApi')>('../lib/mapPingsApi');
  return {
    ...actual,
    getMapPingStatus,
    sendMapPing,
  };
});

vi.mock('../lib/pushNotifications', () => ({
  enablePushNotifications,
}));

vi.mock('../lib/billingApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/billingApi')>('../lib/billingApi');
  return {
    ...actual,
    CRUUSH_PLUS_CHANGED_EVENT: 'cruush-plus:changed',
    getMyBillingStatus,
  };
});

vi.mock('../lib/eventsApi', () => ({
  getActiveEvents,
  revealEventPass,
  emailEventPass,
  joinEventChat,
}));

vi.mock('../lib/userNoticesApi', () => ({
  dismissUserNotice,
  getUserNoticeDismissal,
  markNoticeDismissed,
  resolveNoticeDismissal,
  // Every earlier tutorial key resolves through the same stub.
  resolveAnyNoticeDismissal: (noticeKeys: string[]) => resolveNoticeDismissal(noticeKeys[0]),
}));

vi.mock('./ui/use-mobile', () => ({
  useIsMobile,
}));

vi.mock('./MapView', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    createMapMarkerBadge: (position: string[] = [], hostingTravel: string[] = []) => {
      const knownPosition = position.map((value) => value.trim().toLowerCase()).find((value) => ['top', 'bottom', 'versatile'].includes(value));
      return knownPosition ? { kind: 'position', label: knownPosition, iconName: knownPosition } : null;
    },
    MapMarkerPin: ({ marker }: { marker: { id: string } }) => (
      <div data-testid={`mock-map-marker-pin-${marker.id}`} />
    ),
    default: ({
      markers,
      fitToMarkers,
      focusCoordinates,
      initialZoom,
      preserveInitialZoomOnLoad,
      radiusCircle,
      ghostLeash,
      demoRadiusCircles = [],
      onPinClick,
      onMapClick,
      onMapReady,
    }: {
      markers: any[];
      fitToMarkers?: boolean;
      focusCoordinates?: { approximateLatitude: number; approximateLongitude: number } | null;
      initialZoom?: number;
      preserveInitialZoomOnLoad?: boolean;
      radiusCircle?: {
        center: { approximateLatitude: number; approximateLongitude: number };
        radiusMeters: number;
      } | null;
      ghostLeash?: {
        from: { approximateLatitude: number; approximateLongitude: number };
        to: { approximateLatitude: number; approximateLongitude: number };
      } | null;
      demoRadiusCircles?: Array<{
        center: { approximateLatitude: number; approximateLongitude: number };
        radiusMeters: number;
      }>;
      onPinClick: (marker: any) => void;
      onMapClick?: () => void;
      onMapReady?: (map: typeof mapControls) => void;
    }) => {
      React.useEffect(() => {
        onMapReady?.(mapControls);
      }, [onMapReady]);

      return (
        <div>
          <div
            data-testid="map-focus"
            data-lat={focusCoordinates ? String(focusCoordinates.approximateLatitude) : ''}
            data-lng={focusCoordinates ? String(focusCoordinates.approximateLongitude) : ''}
            data-fit-to-markers={String(Boolean(fitToMarkers))}
            data-initial-zoom={initialZoom == null ? '' : String(initialZoom)}
            data-preserve-initial-zoom={String(Boolean(preserveInitialZoomOnLoad))}
            data-radius-circle={radiusCircle ? String(radiusCircle.radiusMeters) : ''}
            data-radius-lat={radiusCircle ? String(radiusCircle.center.approximateLatitude) : ''}
            data-radius-lng={radiusCircle ? String(radiusCircle.center.approximateLongitude) : ''}
            data-ghost-leash-from-lat={ghostLeash ? String(ghostLeash.from.approximateLatitude) : ''}
            data-ghost-leash-from-lng={ghostLeash ? String(ghostLeash.from.approximateLongitude) : ''}
            data-ghost-leash-to-lat={ghostLeash ? String(ghostLeash.to.approximateLatitude) : ''}
            data-ghost-leash-to-lng={ghostLeash ? String(ghostLeash.to.approximateLongitude) : ''}
            data-demo-radius-circles={String(demoRadiusCircles.length)}
          />
          <button onClick={() => onMapClick?.()}>Map background</button>
          {markers.map((marker) => (
            <div
              data-testid={`marker-${marker.id}`}
              data-badge={marker.badge?.label ?? ''}
              data-lat={String(marker.approximateLatitude)}
              data-lng={String(marker.approximateLongitude)}
              data-last-active={marker.lastActiveLabel ?? ''}
              data-photo={marker.photo ?? ''}
              data-photo-explicit={String(marker.photoExplicit === true)}
              data-relationship={marker.relationship?.kind ?? ''}
              data-can-message={String(marker.relationship?.canMessage ?? '')}
              data-precision={marker.relationship?.precision ?? ''}
              data-display-mode={marker.displayMode ?? ''}
              data-signal={marker.signal ?? ''}
              data-npc-ghost-demo={String(Boolean(marker.npcGhostDemo))}
              data-active-ping={marker.activePing?.id ?? ''}
              key={`marker-data-${marker.id}`}
            />
          ))}
          {markers.map((marker) => marker.id === 'me' ? (
            <div aria-label="Your approximate area" key={marker.id} />
          ) : (
            <button key={marker.id} onClick={() => onPinClick(marker)}>
              {`Pin ${marker.displayName}`}
            </button>
          ))}
        </div>
      );
    },
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}{location.search}</div>;
}

function NormalMapNavigationProbe() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/map')}>Normal map entry</button>;
}

function ServiceAreaRouteProbe() {
  const navigate = useNavigate();
  const { outsideServiceArea } = useMapServiceArea();
  return <>
    <span data-testid="service-area-state">{outsideServiceArea ? 'outside' : 'inside'}</span>
    <button onClick={() => navigate('/feed')}>Go to Feed</button>
    <button onClick={() => navigate('/map')}>Return to Map</button>
  </>;
}

function ProfileBackProbe() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back to map</button>;
}

const launchEvent = {
  id: 'event-1',
  slug: 'the-chocolate-factory-launch',
  title: 'cruush beta launch',
  venueName: 'The Chocolate Factory',
  address: '70 Scott Ave, Brooklyn, NY 11237',
  coordinates: {
    latitude: 40.70982,
    longitude: -73.92256,
  },
  radiusMiles: 1,
  startsAt: '2026-08-01T02:00:00.000Z',
  endsAt: '2026-08-01T09:00:00.000Z',
  pinDisappearsAt: '2026-08-01T09:00:00.000Z',
  chatExpiresAt: '2026-08-08T09:00:00.000Z',
  raUrl: 'https://ra.co/events/2483120',
  iconAsset: 'party-hat',
  attendeeCount: 0,
  joined: false,
  passIconName: null,
  conversationId: null,
};

const KEEP_BROWSING_SUFFIX = 'You can keep browsing the NYC beta map.';
const LOCATION_SYNC_ERROR_MESSAGE = "We found your location, but couldn't update your map location. Try again.";
const GEOLOCATION_ERROR_CASES = [
  {
    code: 1,
    label: 'permission denied',
    expected: `Location permission was not granted. ${KEEP_BROWSING_SUFFIX}`,
  },
  {
    code: 2,
    label: 'position unavailable',
    expected: `We couldn't pin down your location. Check that location services are on for your browser, then try again. ${KEEP_BROWSING_SUFFIX}`,
  },
  {
    code: 3,
    label: 'timeout',
    expected: `Finding your location took too long. Try again in a moment. ${KEEP_BROWSING_SUFFIX}`,
  },
  {
    code: 99,
    label: 'unknown failure',
    expected: `We couldn't get your location right now. ${KEEP_BROWSING_SUFFIX}`,
  },
] as const;

function geolocationError(code: number): GeolocationPositionError {
  return {
    code,
    message: 'Browser location failed.',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

function browserPosition() {
  return {
    coords: {
      latitude: 40.7099,
      longitude: -73.9226,
    },
  };
}

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

function restoreVisualViewport() {
  if (originalVisualViewport) {
    Object.defineProperty(window, 'visualViewport', originalVisualViewport);
    return;
  }

  delete (window as { visualViewport?: VisualViewport }).visualViewport;
}

function placeRecord(id: string): PlaceRecord {
  return {
    id,
    slug: id,
    name: `Spot ${id}`,
    description: '',
    latitude: 40.72,
    longitude: -73.98,
    address: null,
    facilityType: 'bar',
    status: 'published',
    sourceKind: 'official',
    sourceUrl: null,
    sourceAttribution: null,
    verifiedAt: null,
    createdAt: '2026-08-31T12:00:00.000Z',
    tags: [],
    distanceMiles: 1,
    activeCheckins: 0,
    recentActivityAt: null,
    ratingAverage: null,
    ratingCount: 0,
    viewerRating: null,
    suggestionCount: 0,
    autoShortlistedAt: null,
  };
}

async function openMapControls() {
  const trigger = await screen.findByTestId('map-controls-trigger');
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(trigger);
  }
  return screen.findByTestId('map-controls-menu');
}

describe('Spot map loading', () => {
  it('pages to the view limit without duplicating a Spot returned across page boundaries', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => placeRecord(`spot-${index}`));
    const secondPage = [firstPage[99], ...Array.from({ length: 99 }, (_, index) => placeRecord(`spot-${100 + index}`))];
    getPlaces
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
      .mockResolvedValueOnce([placeRecord('spot-199')]);

    const places = await getAllPlacesForMap({
      latitude: 40.73,
      longitude: -73.97,
      radiusMiles: 12,
    });

    // The API caps a page at 100, and the map stops at the nearest few hundred
    // rather than paging the whole radius, so the loop is bounded twice over.
    expect(places).toHaveLength(200);
    expect(places.length).toBeLessThanOrEqual(SPOT_MAP_VIEW_LIMIT);
    expect(new Set(places.map((place) => place.id)).size).toBe(places.length);
    expect(getPlaces).toHaveBeenNthCalledWith(1, expect.objectContaining({ limit: 100, offset: 0 }));
    expect(getPlaces).toHaveBeenNthCalledWith(2, expect.objectContaining({ limit: 100, offset: 100 }));
  });

  it('stops paging when a full page repeats Spots it has already collected', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => placeRecord(`spot-${index}`));
    getPlaces.mockClear();
    getPlaces.mockResolvedValue(firstPage);

    const places = await getAllPlacesForMap({
      latitude: 40.73,
      longitude: -73.97,
      radiusMiles: 12,
    });

    // A server repeating itself must not spin the loop until the tab dies.
    expect(places).toHaveLength(100);
    expect(getPlaces).toHaveBeenCalledTimes(2);
  });

  it('keeps only coordinates inside settled bounds, including a viewport crossing the antimeridian', () => {
    const viewport = {
      center: { latitude: 0, longitude: 180 },
      east: -170,
      north: 10,
      radiusMiles: 100,
      signature: 'settled-viewport',
      south: -10,
      west: 170,
      zoom: 8,
    };

    expect(isCoordinateInViewport(2, 175, viewport)).toBe(true);
    expect(isCoordinateInViewport(-2, -175, viewport)).toBe(true);
    expect(isCoordinateInViewport(2, 0, viewport)).toBe(false);
    expect(isCoordinateInViewport(12, 175, viewport)).toBe(false);
  });
});

describe('Spot taxonomy', () => {
  it('offers the 22 approved facility choices and retains legacy venue reads as Other', () => {
    // The Spots reduction (44d3bca) retired cafe, shop, retail, adult_shop,
    // parking and staircase from the offered set and split transit into
    // rail_station and bus_stop. Archived records keep their stored category,
    // so the retired ones must still resolve to a label.
    expect(PLACE_FACILITY_TYPES).toEqual([
      'clinic', 'bar', 'nightclub', 'community_space', 'park', 'restroom',
      'sauna', 'gym', 'hotel', 'library', 'trail', 'transit',
      'rail_station', 'bus_stop', 'beach', 'adult_venue',
      'music_venue', 'sports_venue', 'woods', 'rest_stop', 'bridge', 'other',
    ]);
    expect(new Set(PLACE_FACILITY_TYPES).size).toBe(PLACE_FACILITY_TYPES.length);
    for (const retired of ['cafe', 'shop', 'retail', 'adult_shop', 'parking', 'staircase']) {
      expect(PLACE_FACILITY_TYPES as readonly string[]).not.toContain(retired);
    }
    expect(PLACE_FACILITY_LABELS.bar).toBe('Bars');
    expect(PLACE_FACILITY_LABELS.venue).toBe('Other');
    expect(PLACE_FACILITY_LABELS.retail).toBe('Other');
    expect(PLACE_FACILITY_LABELS.adult_shop).toBe('Adult venues & stores');
  });

  it('hides every removed identity tag and caps Spot summaries at two labels', () => {
    expect(getVisibleSpotTags(['dyke_bar', 'dyke_spot', 'gay_spot', 't4t_spot'] as never[])).toEqual([]);
    expect(getVisibleSpotTags(['leans_men', 'techno_club'] as never[])).toEqual([]);
    expect(getSpotCategoryLabels('bar', ['dyke_bar', 'gay_spot', 'techno_club'] as never[])).toEqual(['Bars']);
  });
});

describe('MileHighClubBrowseLimit', () => {
  it('offers Mile High Club when inactive and shows the active-pin range otherwise', () => {
    const onActivate = vi.fn();
    const { rerender } = render(
      <MileHighClubBrowseLimit onActivate={onActivate} travelling={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Turn on Mile High Club' }));
    expect(onActivate).toHaveBeenCalledTimes(1);

    rerender(<MileHighClubBrowseLimit onActivate={onActivate} travelling />);
    expect(screen.getByText('Mile High Club range')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on Mile High Club' })).not.toBeInTheDocument();
  });
});

describe('MapHome', () => {
  it('keeps fetched offscreen Spot neighbors in clustering input after the initial camera fit', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([]);
    getPlaces.mockResolvedValue([
      {
        id: 'inside',
        name: 'Inside Spot',
        latitude: 40.73,
        longitude: -73.97,
        facilityType: 'park',
        activeCheckins: 0,
      } as PlaceRecord,
      {
        id: 'edge-neighbor',
        name: 'Edge Neighbor',
        latitude: 40.73,
        longitude: -73.95,
        facilityType: 'park',
        activeCheckins: 0,
      } as PlaceRecord,
    ]);
    const eventfulMap = mapControls as typeof mapControls & {
      on?: (event: string, handler: () => void) => void;
      off?: (event: string, handler: () => void) => void;
      getBounds?: () => { getNorth(): number; getSouth(): number; getEast(): number; getWest(): number };
    };
    eventfulMap.on = vi.fn();
    eventfulMap.off = vi.fn();
    eventfulMap.getBounds = () => ({
      getNorth: () => 40.74,
      getSouth: () => 40.72,
      getEast: () => -73.96,
      getWest: () => -73.98,
    });

    const view = render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);
    try {
      expect(await screen.findByTestId('marker-place-inside')).toBeInTheDocument();
      expect(await screen.findByTestId('marker-place-edge-neighbor')).toBeInTheDocument();
    } finally {
      view.unmount();
      delete eventfulMap.on;
      delete eventfulMap.off;
      delete eventfulMap.getBounds;
    }
  });

  it('drops a person the profile route refused, so there is nothing left to tap', async () => {
    const { notifyProfileUnavailable } = await import('../lib/profileUnavailable');
    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('map-home-shell');
    const markers = await waitFor(() => {
      const found = document.querySelectorAll('[data-testid^="marker-"]:not([data-testid="marker-me"])');
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    const droppedId = markers[0].getAttribute('data-testid')!.replace('marker-', '');

    await act(async () => {
      notifyProfileUnavailable(droppedId);
    });

    await waitFor(() => {
      expect(screen.queryByTestId(`marker-${droppedId}`)).not.toBeInTheDocument();
    });
  });

  it('allows the codeveloper NYC account to use developer-only map tools without bank reviewer access', () => {
    expect(canUseDeveloperMapToolsEmail('admin@cruush.local')).toBe(true);
    expect(canUseDeveloperMapToolsEmail(' codeveloper-nyc@cruush.local ')).toBe(true);
    expect(canUseDeveloperMapToolsEmail('bank-reviewer-nyc@cruush.local')).toBe(false);
    expect(canUseDeveloperMapToolsEmail('payment@cruush.local')).toBe(false);
    expect(canUseDeveloperMapToolsEmail(null)).toBe(false);
  });

  beforeEach(async () => {
    getPlaces.mockReset();
    getPlaces.mockResolvedValue([]);
    getNearbyUsers.mockReset();
    getMutualCruushMap.mockReset();
    revokeMutualCruush.mockReset();
    revokeSentCruush.mockReset();
    sendCruush.mockReset();
    getMyProfile.mockReset();
    getMyVisibilitySets.mockReset();
    getProfileById.mockReset();
    saveMyVisibilityRules.mockReset();
    saveMyVisibilitySet.mockReset();
    updateMyVisibilitySet.mockReset();
    deleteMyVisibilitySet.mockReset();
    applyMyVisibilitySet.mockReset();
    blockUser.mockReset();
    createReport.mockReset();
    decryptDisplayLocationToken.mockReset();
    getMyPrivacySettings.mockReset();
    getMyMapSpotsVisibility.mockReset();
    saveMyMapSpotsVisibility.mockReset();
    getMyMapSpotsVisibility.mockResolvedValue({ visible: true, saved: false });
    saveMyMapSpotsVisibility.mockResolvedValue({ visible: true, saved: true });
    syncMyLocation.mockReset();
    getMyTravelPin.mockReset();
    getMyTravelPin.mockResolvedValue({ pin: null });
    getMapPingStatus.mockReset();
    sendMapPing.mockReset();
    enablePushNotifications.mockReset();
    getMyBillingStatus.mockReset();
    getActiveEvents.mockReset();
    revealEventPass.mockReset();
    emailEventPass.mockReset();
    joinEventChat.mockReset();
    dismissUserNotice.mockReset();
    getUserNoticeDismissal.mockReset();
    markNoticeDismissed.mockReset();
    resolveNoticeDismissal.mockReset();
    useIsMobile.mockReset();
    mapControls.setCenter.mockReset();
    mapControls.setZoom.mockReset();
    mapControls.zoomIn.mockReset();
    mapControls.zoomOut.mockReset();
    mapControls.getCenter.mockReset();
    mapControls.getZoom.mockReset();
    mapControls.getCenter.mockReturnValue({ lat: 40.73, lng: -73.97 });
    mapControls.getZoom.mockReturnValue(13.75);
    toastSuccess.mockReset();
    toastError.mockReset();
    enablePushNotifications.mockResolvedValue({
      pushEnabled: true,
      cruushEnabled: true,
      messagesEnabled: true,
      groupsEnabled: true,
      soundEnabled: true,
    });
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.localStorage.setItem('cruush:ghost-mode-intro-seen', 'true');
    window.localStorage.setItem('cruush:tutorial-v4-seen', 'true');
    dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: '2026-07-31T12:00:00.000Z' });
    getUserNoticeDismissal.mockResolvedValue({ dismissed: true, dismissedAt: '2026-07-31T12:00:00.000Z' });
    resolveNoticeDismissal.mockResolvedValue({ dismissed: true, offline: false });
    markNoticeDismissed.mockImplementation((key: string) => {
      window.localStorage.setItem(key, 'true');
      void dismissUserNotice(key);
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    getMyProfile.mockResolvedValue({
      ...((await import('../lib/profileApi')).emptyProfilePayload),
      id: 'me',
      display_name: 'Me',
      signal: 'Come say hi',
      photos: ['https://example.com/me.jpg'],
      year_of_birth: 1994,
      position: ['Bottom'],
      updated_at: '2026-04-29T12:00:00.000Z',
    });
    getMyVisibilitySets.mockResolvedValue([]);
    saveMyVisibilityRules.mockImplementation(async (visibilityRules) => ({
      ...((await import('../lib/profileApi')).emptyProfilePayload),
      id: 'me',
      display_name: 'Me',
      photos: ['https://example.com/me.jpg'],
      year_of_birth: 1994,
      updated_at: '2026-04-29T12:00:00.000Z',
      visibility_rules: visibilityRules,
    }));
    saveMyVisibilitySet.mockImplementation(async (payload) => ({
      id: 'set-new',
      name: payload.name,
      visibility_rules: payload.visibility_rules,
      created_at: '2026-07-08T12:00:00.000Z',
      updated_at: '2026-07-08T12:00:00.000Z',
    }));
    updateMyVisibilitySet.mockImplementation(async (id, payload) => ({
      id,
      name: payload.name,
      visibility_rules: payload.visibility_rules,
      created_at: '2026-07-08T12:00:00.000Z',
      updated_at: '2026-07-08T12:05:00.000Z',
    }));
    deleteMyVisibilitySet.mockResolvedValue({
      id: 'set-1',
      deleted: true,
    });
    getProfileById.mockResolvedValue({
      id: 'user-1',
      display_name: 'Jordan',
      photos: [],
      bio: 'Out and about tonight.',
      pronouns: ['they/them'],
      custom_pronouns: '',
      year_of_birth: 1998,
      ethnicity: 'Latinx',
      identities: ['Non-binary'],
      presentation: ['Femme'],
      sexuality: ['Queer'],
      body_type: ['Athletic'],
      height: "5'8\"",
      weight: '155 lbs',
      position: ['Vers'],
      role: ['Switch'],
      is_trans: null,
      trans_status_visibility: 'public',
      crowds: ['T4T'],
      availability: ['Now'],
      hosting_travel: ['Hosting'],
      kinks: ['Leather'],
      kink_interests: [{
        kink_id: 'leather',
        label: 'Leather',
      }],
      kinks_visibility: 'public',
      vibes: ['Playful'],
      scenes: ['Warehouse'],
      archetypes: [],
      hobbies: ['Hiking'],
      custom_hobby: '',
      looking_for: ['Dates'],
      hiv_status: ['Negative'],
      hiv_status_visibility: 'mutual_cruushes',
      custom_hiv_status: '',
      condoms: ['Always'],
      custom_condoms: '',
      prep: ['Daily'],
      custom_prep: '',
      doxypep: [],
      custom_doxypep: '',
      covid_vaccine: [],
      custom_covid_vaccine: '',
      mpox_vaccine: ['Vaccinated'],
      custom_mpox_vaccine: '',
      substance_boundaries: ['No alcohol involved'],
      visibility_rules: {},
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    getNearbyUsers.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Jordan',
        display_name: 'Jordan',
        age: 26,
        pronouns: 'they/them',
        lat: 40.7,
        lng: -73.9,
        lastActive: '2m ago',
        distance: '0.2 mi',
        lookingFor: ['Fun'],
        vibes: ['Goth'],
        position: ['Top'],
        hostingTravel: ['Can Host'],
        photo: null,
      },
    ]);
    getMutualCruushMap.mockResolvedValue([]);
    blockUser.mockResolvedValue({
      userId: 'user-1',
      blocked: true,
    });
    createReport.mockResolvedValue({
      id: 'report-1',
      status: 'open',
      createdAt: '2026-07-11T12:00:00.000Z',
    });
    sendCruush.mockResolvedValue({
      id: 'cruush-1',
      fromUserId: 'me',
      toUserId: 'user-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      mutual: true,
    });
    revokeMutualCruush.mockResolvedValue({ revoked: true });
    revokeSentCruush.mockResolvedValue({ revoked: true });
    decryptDisplayLocationToken.mockResolvedValue({
      version: 1,
      subjectUserId: 'me',
      viewerUserId: 'me',
      displayMode: 'PRECISE',
      latE7: 407128000,
      lonE7: -740060000,
      accuracyDisplayM: 250,
      rotationEpoch: null,
      subjectPolicyVersion: 1,
      relationshipGrantVersion: 0,
      expiresAtMs: Date.now() + 60_000,
      animationHint: 'NONE',
      renderNonce: 'render-nonce',
      latitude: 40.7128,
      longitude: -74.006,
    });
    getMyPrivacySettings.mockResolvedValue({
      baseMode: 'PUBLIC_PRECISE',
      ghostModeEnabled: false,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: 0,
    });
    syncMyLocation.mockResolvedValue({
      id: 'me',
      display_location_token: {
        version: 1,
        tokenId: 'synced-token',
        keyId: 'synced-key',
        ciphertext: 'encrypted-location',
        nonce: 'nonce',
        expiresAtMs: Date.now() + 60_000,
        tokenVersion: 1,
      },
      display_expires_at_ms: Date.now() + 60_000,
      display_mode: 'PRECISE',
      animation_hint: 'NONE',
      location_updated_at: '2026-07-31T12:00:00.000Z',
    });
    getMapPingStatus.mockResolvedValue({
      allowance: {
        limit: 3,
        used: 0,
        remaining: 3,
        nextEligibleAt: null,
      },
      activePing: null,
      receivedPings: [],
    });
    sendMapPing.mockResolvedValue({
      allowance: {
        limit: 3,
        used: 1,
        remaining: 2,
        nextEligibleAt: null,
      },
      activePing: {
        id: 'ping-own',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      receivedPings: [],
    });
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: true,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    getActiveEvents.mockResolvedValue([]);
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn().mockImplementation((success: (position: { coords: { latitude: number; longitude: number } }) => void) => {
          success({
            coords: {
              latitude: 40.701,
              longitude: -73.901,
            },
          });
        }),
      },
    });
  });

  it.each(GEOLOCATION_ERROR_CASES)('shows the $label browser-location message on the map', async ({ code, expected }) => {
    useIsMobile.mockReturnValue(false);
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn().mockImplementation((
          _success: (position: ReturnType<typeof browserPosition>) => void,
          failure?: (error: GeolocationPositionError) => void,
        ) => failure?.(geolocationError(code))),
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('shows the position-unavailable message from a fresh event-pass location request', async () => {
    useIsMobile.mockReturnValue(false);
    getActiveEvents.mockResolvedValue([launchEvent]);
    const getCurrentPosition = vi.fn()
      .mockImplementationOnce((success: (position: ReturnType<typeof browserPosition>) => void) => {
        success(browserPosition());
      })
      .mockImplementationOnce((
        _success: (position: ReturnType<typeof browserPosition>) => void,
        failure?: (error: GeolocationPositionError) => void,
      ) => failure?.(geolocationError(2)))
      .mockImplementationOnce((
        _success: (position: ReturnType<typeof browserPosition>) => void,
        failure?: (error: GeolocationPositionError) => void,
      ) => failure?.(geolocationError(2)));
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Pin The Chocolate Factory' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal door pass' }));

    const expected = GEOLOCATION_ERROR_CASES[1].expected;
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getAllByText(expected)).toHaveLength(2));
    expect(revealEventPass).not.toHaveBeenCalled();
  });

  it('does not reveal an event pass when the fresh map-location update fails', async () => {
    useIsMobile.mockReturnValue(false);
    getActiveEvents.mockResolvedValue([launchEvent]);
    syncMyLocation
      .mockResolvedValueOnce({
        id: 'me',
        location_updated_at: '2026-08-12T18:00:00.000Z',
      })
      .mockRejectedValueOnce(new Error('Location update failed.'));
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn().mockImplementation((success: (position: ReturnType<typeof browserPosition>) => void) => {
          success(browserPosition());
        }),
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(syncMyLocation).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Pin The Chocolate Factory' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal door pass' }));

    await waitFor(() => expect(syncMyLocation).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByText(LOCATION_SYNC_ERROR_MESSAGE)).not.toHaveLength(0);
    expect(revealEventPass).not.toHaveBeenCalled();
  });

  it('shows the timeout message from a fresh Ping location request', async () => {
    useIsMobile.mockReturnValue(true);
    const getCurrentPosition = vi.fn()
      .mockImplementationOnce((success: (position: ReturnType<typeof browserPosition>) => void) => {
        success(browserPosition());
      })
      .mockImplementationOnce((
        _success: (position: ReturnType<typeof browserPosition>) => void,
        failure?: (error: GeolocationPositionError) => void,
      ) => failure?.(geolocationError(3)))
      .mockImplementationOnce((
        _success: (position: ReturnType<typeof browserPosition>) => void,
        failure?: (error: GeolocationPositionError) => void,
      ) => failure?.(geolocationError(3)));
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
    await openMapControls();
    fireEvent.click(await screen.findByRole('button', { name: 'Send a Pulse' }));
    const sendButton = await screen.findByRole('button', { name: 'Send Pulse' });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(GEOLOCATION_ERROR_CASES[2].expected);
    expect(sendMapPing).not.toHaveBeenCalled();
  });

  it('uses a mobile-friendly fullscreen shell without page text selection', async () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });

    expect(screen.getByTestId('map-home-shell')).toHaveClass(
      'cruush-map-shell',
      'fixed',
      'inset-0',
      'select-none',
      'overscroll-none',
    );
  });

  it('keeps mobile map chrome inside an offset visual viewport', async () => {
    useIsMobile.mockReturnValue(true);

    const listeners = new Map<string, Set<EventListener>>();
    const visualViewport = {
      height: 714,
      offsetLeft: 24,
      offsetTop: 52,
      pageLeft: 24,
      pageTop: 52,
      scale: 1,
      width: 360,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        const typeListeners = listeners.get(type) ?? new Set<EventListener>();
        typeListeners.add(listener);
        listeners.set(type, typeListeners);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      }),
    } as unknown as VisualViewport;

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });

    const shell = screen.getByTestId('map-home-shell');
    expect(shell).toHaveStyle({
      height: 'calc(714px - var(--cruush-sale-banner-height, 0px))',
      left: '24px',
      maxHeight: 'calc(714px - var(--cruush-sale-banner-height, 0px))',
      minHeight: 'calc(714px - var(--cruush-sale-banner-height, 0px))',
      top: 'calc(52px + var(--cruush-sale-banner-height, 0px))',
      width: '360px',
    });
    expect(shell).not.toHaveClass('inset-0');
    expect(shell).toContainElement(screen.getByTestId('map-top-actions'));
    expect(shell).toContainElement(screen.getByTestId('map-right-actions'));

    Object.assign(visualViewport, {
      height: 766,
      offsetLeft: 0,
      offsetTop: 0,
      width: 384,
    });
    act(() => {
      listeners.get('resize')?.forEach((listener) => listener(new Event('resize')));
    });

    await waitFor(() => expect(shell).toHaveStyle({
      height: 'calc(766px - var(--cruush-sale-banner-height, 0px))',
      left: '0px',
      maxHeight: 'calc(766px - var(--cruush-sale-banner-height, 0px))',
      minHeight: 'calc(766px - var(--cruush-sale-banner-height, 0px))',
      top: 'calc(0px + var(--cruush-sale-banner-height, 0px))',
      width: '384px',
    }));

    // A pinch-zoomed page must not resize the map shell into the zoomed window
    // or drag it around; the bounds from the unzoomed page stay in place.
    Object.assign(visualViewport, {
      height: 383,
      offsetLeft: 90,
      offsetTop: 140,
      scale: 2,
      width: 192,
    });
    act(() => {
      listeners.get('scroll')?.forEach((listener) => listener(new Event('scroll')));
      listeners.get('resize')?.forEach((listener) => listener(new Event('resize')));
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shell).toHaveStyle({ height: 'calc(766px - var(--cruush-sale-banner-height, 0px))', left: '0px', top: 'calc(0px + var(--cruush-sale-banner-height, 0px))', width: '384px' });
    expect(shell).not.toHaveClass('inset-0');
  });

  it('rechecks an allowed browser location when a saved out-of-town location marks the member outside NYC', async () => {
    const { OutsideServiceAreaError } = await import('../lib/usersApi');
    const baseProfile = await getMyProfile();
    getMyProfile.mockResolvedValue({
      ...baseProfile,
      location: { id: 'me', fuzzy_lat: 41.9, fuzzy_lng: -75.6, fuzz_radius_meters: 250, location_updated_at: '2026-09-17T00:00:00.000Z' },
    });
    getNearbyUsers.mockReset();
    getNearbyUsers
      .mockRejectedValueOnce(new OutsideServiceAreaError('NYC open beta.'))
      .mockResolvedValue([]);
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 40.7128, longitude: -74.006, accuracy: 20 } } as GeolocationPosition);
    });
    Object.defineProperty(global.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    Object.defineProperty(global.navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
    });

    try {
      render(
        <MemoryRouter initialEntries={['/map']}>
          <Routes>
            <Route path="/map" element={<MapHome />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
      await waitFor(() => expect(syncMyLocation).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Turn on Mile High Club' })).not.toBeInTheDocument());
    } finally {
      delete (global.navigator as { permissions?: Permissions }).permissions;
    }
  });

  it('never prompts for location just because the member is marked outside NYC', async () => {
    const { OutsideServiceAreaError } = await import('../lib/usersApi');
    const baseProfile = await getMyProfile();
    getMyProfile.mockResolvedValue({
      ...baseProfile,
      location: { id: 'me', fuzzy_lat: 41.9, fuzzy_lng: -75.6, fuzz_radius_meters: 250, location_updated_at: '2026-09-17T00:00:00.000Z' },
    });
    getNearbyUsers.mockReset();
    getNearbyUsers.mockRejectedValue(new OutsideServiceAreaError('NYC open beta.'));
    const getCurrentPosition = vi.fn();
    Object.defineProperty(global.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    const query = vi.fn().mockResolvedValue({ state: 'prompt' });
    Object.defineProperty(global.navigator, 'permissions', { configurable: true, value: { query } });

    try {
      render(
        <MemoryRouter initialEntries={['/map']}>
          <Routes>
            <Route path="/map" element={<MapHome />} />
          </Routes>
        </MemoryRouter>,
      );

      await screen.findByRole('button', { name: 'Turn on Mile High Club' });
      expect(screen.getByText('One free day of cruush+')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'cruush+ rewards' })).toBeInTheDocument();
      expect(screen.getByTestId('launch-login-map-teaser')).toBeInTheDocument();
      expect(screen.getByTestId('outside-service-area-map-canvas')).toHaveClass('pointer-events-none', 'opacity-0');
      expect(screen.queryByTestId('outside-service-area-map-overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('map-top-actions')).toHaveAttribute('data-capsule-width', '298');
      expect(screen.getByTestId('map-plus-stack')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Carousel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mile High Club' })).toHaveAttribute('data-tutorial-target', 'ghost');
      expect(screen.getByRole('button', { name: 'DL Mode settings' })).toBeInTheDocument();
      expect(screen.getByTestId('map-visibility-button')).toBeInTheDocument();
      expect(screen.queryByTestId('map-controls-trigger')).not.toBeInTheDocument();
      expect(screen.getByTestId('map-bug-button-slot')).toBeInTheDocument();
      await waitFor(() => expect(query).toHaveBeenCalled());
      expect(getCurrentPosition).not.toHaveBeenCalled();
    } finally {
      delete (global.navigator as { permissions?: Permissions }).permissions;
    }
  });

  it('keeps the out-of-service navigation state across routes until the map confirms an in-area result', async () => {
    const { OutsideServiceAreaError } = await import('../lib/usersApi');
    const baseProfile = await getMyProfile();
    getMyProfile.mockResolvedValue({
      ...baseProfile,
      location: { id: 'me', fuzzy_lat: 41.9, fuzzy_lng: -75.6, fuzz_radius_meters: 250, location_updated_at: '2026-09-17T00:00:00.000Z' },
    });
    getNearbyUsers.mockRejectedValue(new OutsideServiceAreaError('NYC open beta.'));
    const query = vi.fn().mockResolvedValue({ state: 'prompt' });
    Object.defineProperty(global.navigator, 'permissions', {
      configurable: true,
      value: { query },
    });

    try {
      render(
        <MapServiceAreaProvider>
          <MemoryRouter initialEntries={['/map']}>
            <Routes>
              <Route path="/map" element={<MapHome />} />
              <Route path="/feed" element={<div>Feed page</div>} />
            </Routes>
            <ServiceAreaRouteProbe />
          </MemoryRouter>
        </MapServiceAreaProvider>,
      );

      await screen.findByRole('button', { name: 'Turn on Mile High Club' });
      expect(screen.getByTestId('service-area-state')).toHaveTextContent('outside');
      fireEvent.click(screen.getByRole('button', { name: 'Go to Feed' }));
      expect(screen.getByText('Feed page')).toBeInTheDocument();
      expect(screen.getByTestId('service-area-state')).toHaveTextContent('outside');

      getNearbyUsers.mockResolvedValue([]);
      fireEvent.click(screen.getByRole('button', { name: 'Return to Map' }));
      await waitFor(() => expect(screen.getByTestId('service-area-state')).toHaveTextContent('inside'));
      expect(screen.queryByRole('button', { name: 'Turn on Mile High Club' })).not.toBeInTheDocument();
    } finally {
      delete (global.navigator as { permissions?: Permissions }).permissions;
    }
  });

  it('keeps the admin out-of-service preview navigation state after opening Feed', async () => {
    render(
      <MapServiceAreaProvider>
        <MemoryRouter initialEntries={['/settings/outside-service-area-test']}>
          <Routes>
            <Route path="/settings/outside-service-area-test" element={<MapHome forceOutsideServiceArea />} />
            <Route path="/feed" element={<div>Feed page</div>} />
            <Route path="/map" element={<MapHome />} />
          </Routes>
          <ServiceAreaRouteProbe />
        </MemoryRouter>
      </MapServiceAreaProvider>,
    );

    await screen.findByRole('button', { name: 'Turn on Mile High Club' });
    expect(screen.getByTestId('service-area-state')).toHaveTextContent('outside');
    fireEvent.click(screen.getByRole('button', { name: 'Go to Feed' }));
    expect(screen.getByText('Feed page')).toBeInTheDocument();
    expect(screen.getByTestId('service-area-state')).toHaveTextContent('outside');

    fireEvent.click(screen.getByRole('button', { name: 'Return to Map' }));
    await waitFor(() => expect(screen.getByTestId('service-area-state')).toHaveTextContent('inside'));
  });

  it('exposes the real Ping control to the tutorial and opens the Ping sheet', async () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await openMapControls();
    const pingControl = await screen.findByRole('button', { name: 'Send a Pulse' });
    const rightActions = screen.getByTestId('map-right-actions');
    expect(rightActions).toHaveClass('lg:top-[5.5rem]', 'lg:right-3');
    const mapControls = screen.getByTestId('map-zoom-controls');
    const visibilityControl = screen.getByTestId('map-visibility-button');
    expect(pingControl).toHaveAttribute('data-tutorial-target', 'ping');
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('data-tutorial-target', 'notifications');
    expect(screen.getByRole('button', { name: 'Ghost Mode Settings' })).toHaveAttribute('data-tutorial-target', 'ghost');
    expect(rightActions).toContainElement(pingControl);
    expect(screen.getByTestId('map-controls-menu')).toContainElement(visibilityControl);
    expect(screen.getByTestId('map-controls-menu')).toContainElement(pingControl);
    expect(screen.getByTestId('map-controls-menu')).toContainElement(mapControls);

    fireEvent.click(pingControl);

    expect(await screen.findByRole('dialog')).toHaveAttribute('data-testid', 'map-ping-sheet');
    expect(screen.getByText('3 Pulses left')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Your approximate area')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the Pulse sheet from a Pulse notification link without focusing or zooming to a member', async () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map?pulse=open']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('dialog')).toHaveAttribute('data-testid', 'map-ping-sheet');
    expect(mapControls.setZoom).not.toHaveBeenCalled();
  });

  it('merges only caller-authorized active Pings into nearby and own heart markers', async () => {
    useIsMobile.mockReturnValue(false);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    getMapPingStatus.mockResolvedValue({
      allowance: {
        limit: 3,
        used: 1,
        remaining: 2,
        nextEligibleAt: null,
      },
      activePing: { id: 'ping-own', expiresAt },
      receivedPings: [
        { id: 'ping-nearby', sourceUserId: 'user-1', expiresAt },
        { id: 'ping-hidden', sourceUserId: 'not-in-map-results', expiresAt },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('marker-user-1')).toHaveAttribute('data-active-ping', 'ping-nearby');
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-active-ping', 'ping-own');
    });
    expect(screen.queryByTestId('marker-not-in-map-results')).not.toBeInTheDocument();
  });

  it('refreshes and syncs map location from the Send gesture before sending a Ping', async () => {
    useIsMobile.mockReturnValue(true);
    const finishLocationSyncs: Array<(value: unknown) => void> = [];
    syncMyLocation.mockImplementation(() => new Promise((resolve) => {
      finishLocationSyncs.push(resolve);
    }));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(syncMyLocation).toHaveBeenCalled());
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    await openMapControls();
    fireEvent.click(screen.getByRole('button', { name: 'Send a Pulse' }));
    // The Pulse radius is a slider now; the default of 3 miles is enough here,
    // since this test is about the location sync that precedes the send.
    await screen.findByRole('slider', { name: 'Pulse radius' });
    fireEvent.click(screen.getByRole('button', { name: 'Send Pulse' }));

    await waitFor(() => {
      expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
      expect(syncMyLocation).toHaveBeenCalledTimes(2);
    });
    expect(syncMyLocation.mock.calls[0]?.[0]).not.toHaveProperty('sync_reason');
    expect(syncMyLocation.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      sync_reason: 'PING',
    }));
    expect(sendMapPing).not.toHaveBeenCalled();

    await act(async () => {
      finishLocationSyncs[1]?.({
        id: 'me',
        location_updated_at: '2026-08-09T18:00:00.000Z',
      });
    });

    await waitFor(() => expect(sendMapPing).toHaveBeenCalledWith(3, expect.any(String)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send another Pulse' })).toBeEnabled());
  });

  it('does not send a Ping when the fresh map-location update fails', async () => {
    useIsMobile.mockReturnValue(true);
    syncMyLocation
      .mockResolvedValueOnce({
        id: 'me',
        location_updated_at: '2026-08-12T18:00:00.000Z',
      })
      .mockRejectedValueOnce(new Error('Location update failed.'));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(syncMyLocation).toHaveBeenCalledTimes(1));
    await openMapControls();
    fireEvent.click(screen.getByRole('button', { name: 'Send a Pulse' }));
    const sendButton = screen.getByRole('button', { name: 'Send Pulse' });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(LOCATION_SYNC_ERROR_MESSAGE);
    expect(syncMyLocation).toHaveBeenCalledTimes(2);
    expect(sendMapPing).not.toHaveBeenCalled();
  });

  it('reuses the same Ping idempotency key after an ambiguous delivery failure', async () => {
    useIsMobile.mockReturnValue(true);
    sendMapPing
      .mockRejectedValueOnce(new Error('Ping delivery is incomplete. Try again.'))
      .mockResolvedValueOnce({
        allowance: {
          limit: 3,
          used: 1,
          remaining: 2,
          nextEligibleAt: null,
        },
        activePing: {
          id: 'ping-retried',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        receivedPings: [],
      });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await openMapControls();
    fireEvent.click(await screen.findByRole('button', { name: 'Send a Pulse' }));
    const sendButton = screen.getByRole('button', { name: 'Send Pulse' });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);
    await waitFor(() => expect(sendMapPing).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ping delivery is incomplete. Try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Send Pulse' }));
    await waitFor(() => expect(sendMapPing).toHaveBeenCalledTimes(2));

    const firstIdempotencyKey = sendMapPing.mock.calls[0]?.[1];
    const retryIdempotencyKey = sendMapPing.mock.calls[1]?.[1];
    expect(firstIdempotencyKey).toEqual(expect.any(String));
    expect(retryIdempotencyKey).toBe(firstIdempotencyKey);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send another Pulse' })).toBeEnabled());
  });

  it('does not let a stale status refresh erase a newly sent Ping', async () => {
    useIsMobile.mockReturnValue(true);
    const staleRefresh = deferred<Awaited<ReturnType<typeof getMapPingStatus>>>();
    const sentStatus = deferred<Awaited<ReturnType<typeof sendMapPing>>>();
    sendMapPing.mockReturnValueOnce(sentStatus.promise);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await openMapControls();
    fireEvent.click(await screen.findByRole('button', { name: 'Send a Pulse' }));
    await waitFor(() => expect(getMapPingStatus).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Send Pulse' }));
    await waitFor(() => expect(sendMapPing).toHaveBeenCalled());

    getMapPingStatus.mockImplementationOnce(() => staleRefresh.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Send a Pulse' }));
    await waitFor(() => expect(getMapPingStatus).toHaveBeenCalledTimes(3));

    const activeStatus = {
      allowance: {
        limit: 3,
        used: 1,
        remaining: 2,
        nextEligibleAt: null,
      },
      activePing: {
        id: 'ping-after-send',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      receivedPings: [],
    };

    await act(async () => {
      sentStatus.resolve(activeStatus);
      await sentStatus.promise;
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send another Pulse' })).toBeEnabled());

    await act(async () => {
      staleRefresh.resolve({
        allowance: {
          limit: 3,
          used: 0,
          remaining: 3,
          nextEligibleAt: null,
        },
        activePing: null,
        receivedPings: [],
      });
      await staleRefresh.promise;
    });

    expect(screen.getByRole('button', { name: 'Send another Pulse' })).toBeEnabled();
  });

  it('wires the visible zoom controls to the live map instance', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    const zoomIn = await screen.findByRole('button', { name: 'Zoom in on map' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out on map' });

    await waitFor(() => {
      expect(zoomIn).toBeEnabled();
      expect(zoomOut).toBeEnabled();
    });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomOut);

    expect(mapControls.zoomIn).toHaveBeenCalledTimes(1);
    expect(mapControls.zoomOut).toHaveBeenCalledTimes(1);
  });

  it('silently refreshes an already-open map so Ghost Mode changes replace stale pins', async () => {
    useIsMobile.mockReturnValue(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const setIntervalSpy = vi.spyOn(window, 'setInterval');

    const view = render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    try {
      await screen.findByRole('button', { name: 'Pin Jordan' });
      const callsBeforeRefresh = getNearbyUsers.mock.calls.length;
      const privacyRefresh = setIntervalSpy.mock.calls.find(([, delay]) => delay === 60_000)?.[0];

      expect(privacyRefresh).toEqual(expect.any(Function));
      await act(async () => vi.advanceTimersByTimeAsync(60_000));

      await waitFor(() => expect(getNearbyUsers.mock.calls.length).toBeGreaterThan(callsBeforeRefresh));
      expect(screen.getByRole('button', { name: 'Pin Jordan' })).toBeInTheDocument();
    } finally {
      view.unmount();
      setIntervalSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('fetches another member new Ghost position at the deadline without replacing the map page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const [base] = await getNearbyUsers();
    const deadline = Date.now() + 3_000;
    getNearbyUsers.mockResolvedValue([{ ...base, displayMode: 'GHOST', animationHint: 'FADE_LAST_MINUTE', ghostRotationExpiresAtMs: deadline }]);
    render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);
    const map = await screen.findByTestId('map-focus');
    await screen.findByRole('button', { name: 'Pin Jordan' });
    const calls = getNearbyUsers.mock.calls.length;
    getNearbyUsers.mockResolvedValue([{ ...base, displayMode: 'GHOST', animationHint: 'NONE', lat: 40.71, lng: -73.91 }]);
    await act(async () => vi.advanceTimersByTimeAsync(3_300));
    await waitFor(() => expect(getNearbyUsers.mock.calls.length).toBeGreaterThan(calls));
    expect(screen.getByTestId('marker-user-1')).toHaveAttribute('data-lat', '40.71');
    expect(screen.getByTestId('map-focus')).toBe(map);
  });

  it('clears a discovery rate-limit error after a successful background refresh', async () => {
    const recoveredUsers = await getNearbyUsers();
    getNearbyUsers.mockClear();
    getNearbyUsers.mockRejectedValueOnce(new ApiClientError(429, 'RATE_LIMITED', 'Too many discovery refreshes. Try again later.', { retryAfterSeconds: 1 }));
    navigator.geolocation.getCurrentPosition = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);
    try {
      expect(await screen.findByText('Too many discovery refreshes. Try again later.')).toBeInTheDocument();
      getNearbyUsers.mockResolvedValue(recoveredUsers);
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      expect(screen.getByRole('button', { name: 'Pin Jordan' })).toBeInTheDocument();
      expect(screen.queryByText('Too many discovery refreshes. Try again later.')).not.toBeInTheDocument();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('keeps Spot query membership through pans, applies filters immediately, and reanchors on zoom', async () => {
    navigator.geolocation.getCurrentPosition = vi.fn();
    getPlaces.mockResolvedValue([placeRecord('anchor')]);
    const handlers = new Map<string, Set<() => void>>();
    const eventfulMap = mapControls as typeof mapControls & {
      on?: (event: string, handler: () => void) => void;
      off?: (event: string, handler: () => void) => void;
      getBounds?: () => { getNorth(): number; getSouth(): number; getEast(): number; getWest(): number };
    };
    eventfulMap.on = (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    };
    eventfulMap.off = (event, handler) => { handlers.get(event)?.delete(handler); };
    eventfulMap.getBounds = () => ({ getNorth: () => 40.9, getSouth: () => 40.5, getEast: () => -73.5, getWest: () => -74.3 });
    const view = render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);
    try {
      await screen.findByRole('button', { name: 'Pin Spot anchor' });
      await screen.findByRole('button', { name: 'Pin Jordan' });
      const initialQuery = getPlaces.mock.calls.at(-1)![0];
      const initialCount = getPlaces.mock.calls.length;
      await act(async () => {
        mapControls.getCenter.mockReturnValue({ lat: 40.75, lng: -73.95 });
        handlers.get('moveend')?.forEach((handler) => handler());
      });
      expect(getPlaces).toHaveBeenCalledTimes(initialCount);
      expect(screen.getByRole('button', { name: 'Pin Spot anchor' })).toBeInTheDocument();

      // A same-zoom filter refresh is authoritative: absent records disappear.
      getPlaces.mockResolvedValue([]);
      await openMapControls();
      fireEvent.click(screen.getByTestId('map-places-button'));
      fireEvent.click(await screen.findByText(/^Spot filters/));
      fireEvent.click(await screen.findByRole('switch', { name: 'Show Park' }));
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({
        latitude: initialQuery.latitude, longitude: initialQuery.longitude,
        excludedFacilityTypes: expect.arrayContaining(['park']),
      })));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Pin Spot anchor' })).not.toBeInTheDocument());
      const afterFilter = getPlaces.mock.calls.length;
      await act(async () => {
        mapControls.getZoom.mockReturnValue(15);
        handlers.get('zoomend')?.forEach((handler) => handler());
        handlers.get('moveend')?.forEach((handler) => handler());
      });
      await waitFor(() => expect(getPlaces.mock.calls.length).toBeGreaterThan(afterFilter));
      expect(getPlaces.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ latitude: 40.75, longitude: -73.95 }));
    } finally {
      view.unmount();
      delete eventfulMap.on;
      delete eventfulMap.off;
      delete eventfulMap.getBounds;
    }
  });

  it('reanchors Spots for a same-zoom MHC location change without arming the next manual pan', async () => {
    navigator.geolocation.getCurrentPosition = vi.fn();
    const travel = deferred<{ pin: { userId: string; latitude: number; longitude: number; label: string; setAtMs: number; movableAtMs: number } }>();
    getMyTravelPin.mockReturnValue(travel.promise);
    const handlers = new Map<string, Set<() => void>>();
    const eventfulMap = mapControls as typeof mapControls & {
      on?: (event: string, handler: () => void) => void;
      off?: (event: string, handler: () => void) => void;
      getBounds?: () => { getNorth(): number; getSouth(): number; getEast(): number; getWest(): number };
    };
    eventfulMap.on = (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    };
    eventfulMap.off = (event, handler) => { handlers.get(event)?.delete(handler); };
    eventfulMap.getBounds = () => ({ getNorth: () => 40.9, getSouth: () => 40.5, getEast: () => -73.5, getWest: () => -74.3 });
    const view = render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);
    try {
      await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40.73, longitude: -73.97 })));
      await act(async () => {
        // Model MapView's synchronous setCenter for the newly loaded MHC pin.
        mapControls.getCenter.mockReturnValue({ lat: 40.8, lng: -73.95 });
        travel.resolve({ pin: { userId: 'me', latitude: 40.8, longitude: -73.95, label: 'Harlem', setAtMs: 0, movableAtMs: 0 } });
      });
      await waitFor(() => expect(getPlaces.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ latitude: 40.8, longitude: -73.95 })));
      const afterLocationChange = getPlaces.mock.calls.length;
      await act(async () => {
        handlers.get('moveend')?.forEach((handler) => handler());
        mapControls.getCenter.mockReturnValue({ lat: 40.85, lng: -73.9 });
        handlers.get('moveend')?.forEach((handler) => handler());
      });
      expect(getPlaces).toHaveBeenCalledTimes(afterLocationChange);
    } finally {
      view.unmount();
      delete eventfulMap.on;
      delete eventfulMap.off;
      delete eventfulMap.getBounds;
    }
  });

  it('coalesces overlapping discovery refreshes and loads the latest settled viewport', async () => {
    const recoveredUsers = await getNearbyUsers();
    getNearbyUsers.mockClear();
    navigator.geolocation.getCurrentPosition = vi.fn();
    const handlers = new Map<string, Set<() => void>>();
    const eventfulMap = mapControls as typeof mapControls & {
      on?: (event: string, handler: () => void) => void;
      off?: (event: string, handler: () => void) => void;
      getBounds?: () => { getNorth(): number; getSouth(): number; getEast(): number; getWest(): number };
    };
    eventfulMap.on = (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    };
    eventfulMap.off = (event, handler) => { handlers.get(event)?.delete(handler); };
    eventfulMap.getBounds = () => ({ getNorth: () => 40.9, getSouth: () => 40.5, getEast: () => -73.5, getWest: () => -74.3 });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const starts: number[] = [];
    getNearbyUsers.mockImplementation(async () => { starts.push(Date.now()); return recoveredUsers; });
    const view = render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);
    try {
      await screen.findByRole('button', { name: 'Pin Jordan' });
      await act(async () => vi.advanceTimersByTimeAsync(3_000));
      const inFlight = deferred<typeof recoveredUsers>();
      getNearbyUsers.mockImplementationOnce(() => { starts.push(Date.now()); return inFlight.promise; });
      const beforeRefresh = getNearbyUsers.mock.calls.length;
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      await act(async () => vi.advanceTimersByTimeAsync(2_500));
      expect(getNearbyUsers).toHaveBeenCalledTimes(beforeRefresh + 1);
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        mapControls.getCenter.mockReturnValue({ lat: 40.74, lng: -73.96 });
        handlers.get('moveend')?.forEach((handler) => handler());
      });
      await act(async () => vi.advanceTimersByTimeAsync(700));
      await act(async () => {
        mapControls.getCenter.mockReturnValue({ lat: 40.75, lng: -73.95 });
        handlers.get('moveend')?.forEach((handler) => handler());
      });
      await act(async () => vi.advanceTimersByTimeAsync(700));
      expect(getNearbyUsers).toHaveBeenCalledTimes(beforeRefresh + 1);
      await act(async () => { inFlight.resolve(recoveredUsers); });
      await act(async () => vi.advanceTimersByTimeAsync(2_500));
      expect(getNearbyUsers).toHaveBeenCalledTimes(beforeRefresh + 2);
      expect(getNearbyUsers.mock.calls.at(-1)?.[0]).toEqual({ lat: 40.75, lng: -73.95 });
      expect(starts.slice(1).every((start, index) => start - starts[index] >= 2_500)).toBe(true);
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      await openMapControls();
      fireEvent.click(screen.getByTestId('map-seeking-button'));
      const beforeApply = getNearbyUsers.mock.calls.length;
      const lastBackgroundStart = starts.at(-1)!;
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply', exact: true })); });
      expect(getNearbyUsers).toHaveBeenCalledTimes(beforeApply + 1);
      expect(starts.at(-1)! - lastBackgroundStart).toBeLessThan(2_500);

      const olderRequest = deferred<typeof recoveredUsers>();
      getNearbyUsers.mockImplementationOnce(() => { starts.push(Date.now()); return olderRequest.promise; });
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      await act(async () => vi.advanceTimersByTimeAsync(2_500));
      const whileOlderRequestRuns = getNearbyUsers.mock.calls.length;
      const olderRequestStart = starts.at(-1)!;
      await openMapControls();
      fireEvent.click(screen.getByTestId('map-seeking-button'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Apply', exact: true }));
        window.dispatchEvent(new Event('focus'));
      });
      expect(getNearbyUsers).toHaveBeenCalledTimes(whileOlderRequestRuns);
      await act(async () => { olderRequest.resolve(recoveredUsers); });
      expect(getNearbyUsers).toHaveBeenCalledTimes(whileOlderRequestRuns + 1);
      expect(getNearbyUsers.mock.calls.at(-1)?.[0]).toEqual({ lat: 40.75, lng: -73.95 });
      expect(starts.at(-1)! - olderRequestStart).toBeLessThan(2_500);
    } finally {
      view.unmount();
      vi.useRealTimers();
      delete eventfulMap.on;
      delete eventfulMap.off;
      delete eventfulMap.getBounds;
    }
  });

  it('waits for discovery retryAfterSeconds while removing expired pins, then recovers automatically', async () => {
    const [baseUser] = await getNearbyUsers();
    getNearbyUsers.mockClear();
    navigator.geolocation.getCurrentPosition = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getNearbyUsers.mockResolvedValue([{ ...baseUser, displayExpiresAtMs: Date.now() + 5_000 }]);
    const view = render(<MemoryRouter initialEntries={['/map?focusUserId=user-1']}><MapHome /></MemoryRouter>);
    try {
      await screen.findByRole('button', { name: 'Pin Jordan' });
      await act(async () => vi.advanceTimersByTimeAsync(2_500));
      const beforeLimit = getNearbyUsers.mock.calls.length;
      let rejectedAt = 0;
      getNearbyUsers.mockImplementationOnce(async () => {
        rejectedAt = Date.now();
        throw new ApiClientError(429, 'RATE_LIMITED', 'Too many discovery refreshes. Try again later.', { retryAfterSeconds: 10 });
      });
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      expect(getNearbyUsers).toHaveBeenCalledTimes(beforeLimit + 1);
      getNearbyUsers.mockResolvedValue([{ ...baseUser, displayExpiresAtMs: Date.now() + 60_000 }]);
      await act(async () => vi.advanceTimersByTimeAsync(3_000));
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(screen.queryByRole('button', { name: 'Pin Jordan' })).not.toBeInTheDocument();
      await act(async () => vi.advanceTimersByTimeAsync(Math.max(0, rejectedAt + 9_900 - Date.now())));
      expect(getNearbyUsers).toHaveBeenCalledTimes(beforeLimit + 1);
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(getNearbyUsers).toHaveBeenCalledTimes(beforeLimit + 2);
      expect(screen.getByRole('button', { name: 'Pin Jordan' })).toBeInTheDocument();
      expect(screen.queryByText('Too many discovery refreshes. Try again later.')).not.toBeInTheDocument();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('navigates directly to the full profile on a short mobile tap', async () => {
    useIsMobile.mockReturnValue(true);
    window.localStorage.setItem('cruush.desktopPageLayout', 'fullscreen');

    const { container } = render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'cruush' })).toHaveClass('sr-only');
    expect(container.querySelector('img[src*="cruush-logo.svg"]')).toBeNull();
    expect(screen.queryByText('nyc open beta')).not.toBeInTheDocument();

    const profilePin = await screen.findByRole('button', { name: 'Pin Jordan' });
    await openMapControls();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zoom in on map' })).toBeEnabled());
    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(profilePin, pointerDown);
    fireEvent.click(profilePin, { detail: 1 });

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-1');
    expect(JSON.parse(window.sessionStorage.getItem('cruush:map-viewport-restore') ?? 'null')).toEqual({
      latitude: 40.73,
      longitude: -73.97,
      zoom: 13.75,
      travelPinKey: null,
    });
  });

  it('keeps the saved camera instead of jumping to an unchanged Mile High Club pin', async () => {
    useIsMobile.mockReturnValue(true);
    getMyTravelPin.mockResolvedValue({
      pin: { userId: 'me', latitude: 40.8, longitude: -73.95, label: 'Harlem', setAtMs: 0, movableAtMs: 0 },
    });
    window.sessionStorage.setItem('cruush:map-viewport-restore', JSON.stringify({
      latitude: 40.72,
      longitude: -74.0,
      zoom: 15,
      travelPinKey: '40.80000,-73.95000',
    }));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });
    await waitFor(() => expect(getMyTravelPin).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lat', '');
  });

  it('restores the last zoom from local storage on a fresh map load', async () => {
    window.localStorage.setItem('cruush:map-last-zoom', '16.25');

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    const map = await screen.findByTestId('map-focus');
    expect(map).toHaveAttribute('data-initial-zoom', '16.25');
    expect(map).toHaveAttribute('data-preserve-initial-zoom', 'true');
  });

  it('centers on a Mile High Club pin dropped after the camera was saved', async () => {
    useIsMobile.mockReturnValue(true);
    getMyTravelPin.mockResolvedValue({
      pin: { userId: 'me', latitude: 40.8, longitude: -73.95, label: 'Harlem', setAtMs: 0, movableAtMs: 0 },
    });
    window.sessionStorage.setItem('cruush:map-viewport-restore', JSON.stringify({
      latitude: 40.72,
      longitude: -74.0,
      zoom: 15,
      travelPinKey: null,
    }));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lat', '40.8'));
  });

  it('uses the full profile page when the viewport cannot fit an accessible desktop panel', async () => {
    useIsMobile.mockImplementation((breakpoint?: number) => breakpoint === 1120);
    window.localStorage.setItem('cruush.desktopPageLayout', 'fullscreen');

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pin Jordan' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-1');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('keeps an applied Seeking filter after opening a mobile profile and returning to the map', async () => {
    useIsMobile.mockReturnValue(true);
    window.localStorage.setItem('cruush.desktopPageLayout', 'fullscreen');

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
          <Route path="/profile/:userId" element={<ProfileBackProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    const seekingButton = await screen.findByRole('button', { name: /^seeking$/i });
    fireEvent.click(seekingButton);
    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    fireEvent.click(screen.getByRole('option', { name: 'man' }));
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^seeking$/i }).style.background).toBe('var(--cruush-gradient)');
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Pin Jordan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to map' }));

    await openMapControls();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^seeking$/i }).style.background).toBe('var(--cruush-gradient)');
    });
    expect(getNearbyUsers).toHaveBeenLastCalledWith(
      {
        lat: expect.any(Number),
        lng: expect.any(Number),
      },
      expect.objectContaining({ identities: ['man'] }),
      { limit: 500 },
    );
  });

  it('starts recently active closed above the mobile bottom nav and keeps the toggle working', async () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome developerToolsEnabled />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });

    const recentPanel = screen.getByTestId('recently-active-panel');
    const recentToggle = screen.getByRole('button', { name: 'Show recently active bar' });

    expect(recentPanel.parentElement).toHaveClass('bottom-[calc(5.75rem+env(safe-area-inset-bottom))]', 'left-3', 'right-3', 'z-[130]');
    expect(recentPanel).toHaveClass('max-w-max', 'p-0');
    expect(recentToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAccessibleName('Hide recently active bar');
    expect(recentPanel).toHaveClass('w-fit', 'max-w-full', 'px-[5px]', 'py-3');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('gap-[5px]');
    expect(screen.getByTestId('recently-active-tile-user-1')).toHaveClass('w-20');

    fireEvent.click(recentToggle);
    expect(recentToggle).toHaveAccessibleName('Show recently active bar');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();
  });

  it('does not show a saved launch pass icon outside the one-mile live radius or duplicate the chat invite', async () => {
    useIsMobile.mockReturnValue(false);
    getActiveEvents.mockResolvedValue([{
      ...launchEvent,
      attendeeCount: 3,
      passIconName: 'map',
    }]);
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn().mockImplementation((success: (position: { coords: { latitude: number; longitude: number } }) => void) => {
          success({
            coords: {
              latitude: 40.758,
              longitude: -73.9855,
            },
          });
        }),
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pin The Chocolate Factory' }));

    expect(await screen.findByText('The Chocolate Factory')).toBeInTheDocument();
    expect(screen.getByText('The door pass unlocks when you are within 1 mile of the venue.')).toBeInTheDocument();
    expect(screen.queryByText('Show this icon at the door. It changes every hour.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join launch party' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ask for chat invite/i })).not.toBeInTheDocument();
    expect(revealEventPass).not.toHaveBeenCalled();
  });

  it('reveals the hourly launch pass using live browser coordinates inside one mile', async () => {
    useIsMobile.mockReturnValue(false);
    getActiveEvents.mockResolvedValue([launchEvent]);
    revealEventPass.mockResolvedValue({
      eventSlug: 'the-chocolate-factory-launch',
      iconName: 'notifications',
      validFrom: new Date(Date.now()).toISOString(),
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      hourIndex: 22,
      withinRadius: true,
      emailAvailable: true,
    });
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn().mockImplementation((success: (position: { coords: { latitude: number; longitude: number } }) => void) => {
          success({
            coords: {
              latitude: 40.7099,
              longitude: -73.9226,
            },
          });
        }),
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pin The Chocolate Factory' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal door pass' }));

    await waitFor(() => expect(revealEventPass).toHaveBeenCalledWith('the-chocolate-factory-launch', {
      latitude: 40.7099,
      longitude: -73.9226,
    }));
    expect(await screen.findByText('Show this icon at the door. It changes every hour.')).toBeInTheDocument();
    expect(screen.getByText('notifications | hour 23')).toBeInTheDocument();
  });

  it('keeps recently active visible while launch event details are open', async () => {
    useIsMobile.mockReturnValue(false);
    getActiveEvents.mockResolvedValue([launchEvent]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Pin Jordan' })).toBeInTheDocument();
    expect(screen.getByTestId('recently-active-panel')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Pin The Chocolate Factory' }));

    expect(await screen.findByText('The Chocolate Factory')).toBeInTheDocument();
    expect(screen.getByTestId('recently-active-panel')).toBeInTheDocument();
  });

  it('does not show raw server errors from launch event actions', async () => {
    useIsMobile.mockReturnValue(false);
    getActiveEvents.mockResolvedValue([launchEvent]);
    joinEventChat.mockRejectedValue(new ApiClientError(500, 'INTERNAL_ERROR', 'Internal server error'));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pin The Chocolate Factory' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Join launch party' }));

    expect(await screen.findByText('Unable to join the party chat right now. Try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument();
  });

  it('renders responsive map top chrome with larger controls and opens DL Mode settings from the top slot', async () => {
    useIsMobile.mockReturnValue(false);
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome developerToolsEnabled />} />
          <Route path="/privacy/ghost-mode" element={<LocationProbe />} />
          <Route path="/privacy/dl-mode" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    const luckyIcon = screen.getByRole('button', { name: 'Carousel' }).querySelector('img');
    const ghostModeButton = screen.getByRole('button', { name: 'Ghost Mode Settings' });
    // The eye opens DL Mode settings, the way the Ghost Mode mark beside it
    // opens its own page; the on/off switch lives on that page.
    const dlModeButton = screen.getByRole('button', { name: 'DL Mode settings' });
    const dlModeIcon = dlModeButton.querySelector('[data-testid="dl-mode-mark"]');
    const ghostModeIcon = ghostModeButton.querySelector('img');
    const notificationButton = screen.getByRole('button', { name: 'Notifications' });
    const notificationIcon = notificationButton.querySelector('img');
    const settingsButton = screen.getByRole('button', { name: 'Settings' });
    const settingsIcon = settingsButton.querySelector('img');
    const locationButton = screen.getByRole('button', { name: /center your location|finding your location/i });

    const topActions = screen.getByTestId('map-top-actions');
    const plusStack = screen.getByTestId('map-plus-stack');
    const bugButtonSlot = screen.getByTestId('map-bug-button-slot');
    const rightActions = screen.getByTestId('map-right-actions');
    const mapControls = screen.getByTestId('map-zoom-controls');
    const cruushPlusButton = await screen.findByRole('button', { name: 'cruush+ rewards' });
    const pingButton = screen.getByRole('button', { name: 'Send a Pulse' });
    const pingIcon = pingButton.querySelector('svg');

    expect(screen.getByTestId('map-home-shell')).toHaveClass('relative');
    expect(screen.getByTestId('map-home-shell')).not.toHaveClass('fixed', 'inset-0');
    expect(screen.getByTestId('map-top-chrome')).toHaveClass('pointer-events-none', 'z-[1000]');
    // The bar carries icons only. cruush+ and the bug control are their own
    // corner controls beside it rather than members of it.
    // Restore the established larger composition while keeping every center
    // control equal-sized.
    expect(topActions).toHaveClass(
      'pointer-events-auto',
      'justify-center',
      'h-[70px]',
      'w-[298px]',
      'gap-1',
      'px-2.5',
      'py-2',
    );
    expect(topActions).not.toHaveClass('max-[430px]:px-0.5', 'sm:gap-1', 'sm:px-2.5');
    expect(topActions).not.toContainElement(screen.getByTestId('map-plus-stack'));
    expect(topActions).not.toContainElement(screen.getByTestId('map-bug-button-slot'));
    for (const button of [
      screen.getByRole('button', { name: 'Carousel' }),
      ghostModeButton,
      dlModeButton,
      notificationButton,
      settingsButton,
    ]) {
      expect(button).toHaveClass('size-[3.25rem]');
      expect(button).not.toHaveClass('max-[360px]:size-10', 'sm:size-12');
    }
    expect(topActions).not.toHaveClass('sm:max-w-[34rem]');
    // The pill is centred inside the measuring frame that scales it, and that
    // frame takes the width left between the corner controls.
    expect(topActions.parentElement).toHaveClass('relative', 'min-w-0', 'flex-1');
    expect(topActions).toHaveClass('absolute', 'left-1/2', 'top-0');
    expect(topActions.parentElement?.parentElement).toHaveClass('w-full');
    expect(topActions.parentElement?.parentElement).not.toHaveClass('mx-auto', 'max-w-[42rem]');
    expect(topActions).not.toHaveClass('mt-11');
    expect(plusStack).toHaveClass('relative', 'shrink-0');
    expect(bugButtonSlot).toHaveClass('h-12', 'w-12', 'sm:h-10', 'sm:w-10', 'lg:h-11', 'lg:w-11');
    expect(plusStack).toContainElement(cruushPlusButton);
    expect(plusStack).not.toContainElement(pingButton);
    expect(topActions).not.toContainElement(cruushPlusButton);
    expect(topActions).not.toContainElement(pingButton);
    expect(rightActions).toContainElement(pingButton);
    expect(rightActions).toHaveClass('z-[900]');
    for (const hitLayer of [plusStack, topActions, bugButtonSlot, rightActions]) {
      expect(hitLayer).toHaveAttribute('data-map-control-hit-layer', 'true');
    }
    fireEvent.pointerEnter(topActions);
    expect(document.documentElement).toHaveAttribute('data-cruush-map-controls-hovered', 'true');
    fireEvent.pointerLeave(topActions);
    expect(document.documentElement).not.toHaveAttribute('data-cruush-map-controls-hovered');
    expect(screen.getByTestId('map-controls-menu')).toContainElement(screen.getByTestId('map-visibility-button'));
    expect(screen.getByTestId('map-controls-menu')).toContainElement(pingButton);
    expect(screen.getByTestId('map-controls-menu')).toContainElement(mapControls);
    // The Pulse control carries its own ring, so it sizes with the stack.
    expect(pingButton).toHaveClass(
      'size-11',
      'shrink-0',
      'bg-[color:var(--cruush-black-glass)]',
      'text-[#c8ff31]',
      'sm:size-12',
      'lg:size-[3.25rem]',
      '[&_svg]:!h-full',
      '[&_svg]:!w-full',
    );
    expect(pingButton).not.toHaveClass('absolute', 'mt-2');
    // Controls use the approved compact clearance beneath the top capsule.
    expect(rightActions).toHaveClass('right-3', 'top-[5rem]', 'gap-1', 'sm:right-4', 'lg:right-3', 'lg:gap-2', 'lg:top-[5.5rem]');
    expect(cruushPlusButton).toHaveClass(
      'cruush-plus-shimmer-button',
      'cruush-logo-font',
      'normal-case',
      'tracking-normal',
      'h-[3.315rem]',
      'px-[0.82875rem]',
      'text-[1.105rem]',
      'max-[360px]:h-[3.03875rem]',
      'max-[360px]:px-[0.414375rem]',
      'max-[360px]:text-[0.82875rem]',
      'sm:h-[3.85rem]',
      'sm:px-[1.4rem]',
      'sm:text-[1.75rem]',
    );
    expect(screen.queryByRole('button', { name: 'Safety Center' })).not.toBeInTheDocument();
    expect(luckyIcon).toHaveClass('h-11', 'w-11', 'scale-[1.28]', 'object-contain');
    expect(luckyIcon).not.toHaveClass('max-[360px]:h-9', 'lg:h-11');
    expect(ghostModeIcon).toHaveClass('h-11', 'w-11', 'scale-[1.22]', 'object-contain');
    expect(ghostModeIcon).not.toHaveClass('max-[360px]:h-9', 'lg:h-11');
    expect(dlModeIcon).toHaveClass('!h-11', '!w-11', 'scale-[1.18]');
    expect(dlModeIcon).not.toHaveClass('max-[360px]:!h-9', 'lg:!h-11');
    expect(settingsButton.nextElementSibling).toBe(notificationButton);
    expect(topActions.lastElementChild).toBe(notificationButton);
    for (const button of [
      screen.getByRole('button', { name: 'Carousel' }),
      ghostModeButton,
      dlModeButton,
      notificationButton,
      settingsButton,
    ]) {
      // Hover draws no circle around a mark: the control stays transparent.
      expect(button).toHaveClass('bg-transparent', 'hover:bg-transparent', 'focus-visible:bg-transparent');
      expect(button).not.toHaveClass('hover:bg-black/45');
      expect(button).not.toHaveClass('hover:bg-white/10');
    }
    expect(dlModeButton).not.toHaveClass('bg-white/[0.07]');
    expect(notificationIcon).toHaveClass('h-11', 'w-11', 'scale-[1.28]', 'object-contain');
    expect(settingsIcon).toHaveClass('h-11', 'w-11', 'object-contain');
    expect(settingsIcon).not.toHaveClass('max-[360px]:h-9', 'lg:h-11');
    expect(dlModeIcon).toHaveAttribute('data-source', 'Julien supplied balaclava halo DL Mode icon');
    expect(dlModeIcon).toHaveAttribute('data-tone', 'gradient');
    expect(dlModeIcon?.querySelector('[data-dl-mode-part="balaclava-halo"]')).toHaveAttribute('href', expect.stringContaining('dl-mode-balaclava-halo-user-supplied.png'));
    expect(dlModeIcon?.querySelector('[data-dl-mode-part="halo-cutout"]')).not.toBeInTheDocument();
    expect(dlModeIcon?.querySelector('[data-dl-mode-part="wing-cutout"]')).not.toBeInTheDocument();
    expect(decodeURIComponent(ghostModeIcon?.getAttribute('src') ?? '')).toContain("fill='#ffffff'");
    expect(locationButton).toHaveClass('rounded-full', 'bg-[color:var(--cruush-black-glass)]', 'backdrop-blur-[var(--cruush-black-glass-blur)]');
    expect(locationButton.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(screen.queryByText('DL Mode Active')).not.toBeInTheDocument();

    await screen.findByRole('button', { name: 'Pin Jordan' });

    // The eye opens the DL Mode page, where the switch lives; it no longer
    // toggles from the map itself.
    fireEvent.click(dlModeButton);
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/privacy/dl-mode');
    expect(window.localStorage.getItem('cruush:dl-mode-enabled')).not.toBe('false');
  });

  it('keeps one combined active crowd notice on the map and returns to Visibility', async () => {
    useIsMobile.mockReturnValue(false);
    getMyProfile.mockResolvedValue({
      ...((await import('../lib/profileApi')).emptyProfilePayload),
      id: 'me',
      display_name: 'Me',
      photos: ['https://example.com/me.jpg'],
      is_trans: true,
      crowds: ['Dyke', 'Gay', 'T4T'],
      visibility_rules: {
        active_crowd_modes: ['Gay', 'T4T', 'Dyke'],
      },
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    const crowdNotice = await screen.findByText('Dyke, Gay, and T4T Crowds Active');
    expect(crowdNotice).toBeInTheDocument();
    expect(screen.queryByText(/^Dyke Crowd Active$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Gay Crowd Active$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^T4T Crowd Active$/)).not.toBeInTheDocument();

    fireEvent.click(crowdNotice);
    expect(await screen.findByRole('heading', { name: 'Visibility Controls' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Crowds' })).not.toBeInTheDocument();
  });

  it('opens the desktop own-profile side panel from router state', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={[{
        pathname: '/map',
        state: { openOwnProfilePanel: true },
      }]}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    // The owner capsule was removed in 206c04f; the panel itself still carries
    // the own-profile label.
    expect(await screen.findByRole('complementary', { name: 'Your profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
  });

  it('opens Carousel as a full page route on desktop', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/lucky" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });

    fireEvent.click(screen.getByRole('button', { name: 'Carousel' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/lucky');
    expect(screen.queryByRole('complementary', { name: 'Carousel' })).not.toBeInTheDocument();
  });

  it('keeps Cruise Carousel as a full page route on mobile', async () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/lucky" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Carousel' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/lucky');
  });

  it('opens checkout from the top cruush+ button', async () => {
    useIsMobile.mockReturnValue(false);
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: true,
      expiresAt: '2026-08-01T12:00:00.000Z',
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/store" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'cruush+ rewards' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/store');
  });

  it('opens the full Carousel page for free desktop users', async () => {
    useIsMobile.mockReturnValue(false);
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/lucky" element={<LocationProbe />} />
          <Route path="/store" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'cruush+ rewards' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Carousel' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/lucky');
    expect(screen.queryByRole('complementary', { name: 'Carousel' })).not.toBeInTheDocument();
  });

  it('lets free users open seeking and visibility controls from the map', async () => {
    useIsMobile.mockReturnValue(false);
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/rewards" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'cruush+ rewards' })).toBeInTheDocument();

    await openMapControls();
    fireEvent.click(screen.getByRole('button', { name: /^seeking$/i }));

    expect(screen.getByRole('heading', { name: 'Seeking Filter' })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');

    unmount();

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/rewards" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    expect(await screen.findByRole('button', { name: /^visibility$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^visibility$/i }));

    expect(screen.getByRole('heading', { name: 'Visibility Controls' })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
  });

  it('fails closed when billing status cannot load and shows the basic visibility gate', async () => {
    useIsMobile.mockReturnValue(false);
    getMyBillingStatus.mockRejectedValue(new Error('Billing unavailable'));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    fireEvent.click(await screen.findByRole('button', { name: /^visibility$/i }));
    const dialog = screen.getByRole('dialog', { name: 'Visibility Controls' });
    expect(within(dialog).getByText('Basic includes up to 3 hidden filters.')).toBeInTheDocument();
  });

  it('never opens the map tutorial, even for a new member or saved tutorial progress', async () => {
    useIsMobile.mockReturnValue(false);
    window.localStorage.removeItem('cruush:tutorial-v4-seen');
    window.localStorage.removeItem('cruush:tutorial-v5-seen');
    window.localStorage.setItem('cruush:tutorial-v5-progress', 'ghost');
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: false });

    render(
      <MemoryRouter initialEntries={['/map?replayTutorial=1']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    await screen.findByRole('button', { name: /^seeking$/i });
    expect(screen.queryByTestId('map-controls-tutorial')).not.toBeInTheDocument();
    window.localStorage.removeItem('cruush:tutorial-v5-progress');
  });

  it('keeps visibility controls manual without saved-set affordances', async () => {
    useIsMobile.mockReturnValue(false);
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/rewards" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    expect(await screen.findByRole('button', { name: /^visibility$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^visibility$/i }));

    expect(screen.getByRole('heading', { name: 'Visibility Controls' })).toBeInTheDocument();
    expect(screen.queryByText('Saved sets')).not.toBeInTheDocument();
    expect(screen.queryByText('Upgrade for saved sets')).not.toBeInTheDocument();
    expect(screen.queryByText(/Free accounts/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Distance')).toBeInTheDocument();
  });

  it('applies map visibility through the visibility-only profile API', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    expect(await screen.findByRole('button', { name: /^visibility$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^visibility$/i }));
    fireEvent.click(screen.getByRole('switch', { name: 'Distance' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Tags' }), { target: { value: 'reviewtag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => expect(saveMyVisibilityRules).toHaveBeenCalledWith(expect.objectContaining({
      active_crowd_modes: [],
      distance: 100,
      age_range: null,
      tags: ['reviewtag'],
    })));
    expect(screen.queryByText('Request validation failed')).not.toBeInTheDocument();
  });

  it('floats recently active to the right side on desktop without a profile preview', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });

    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('left-0', 'right-0', 'px-4');
    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('max-w-max', 'p-0', 'mx-auto');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('pointer-events-auto');
  });

  it.each([{ distance: 25 }, { tags: ['reviewtag'] }])('only shows the cruush gradient on active seeking and visibility controls: %j', async (visibilityRules) => {
    useIsMobile.mockReturnValue(false);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    const inactiveSeekingButton = screen.getByRole('button', { name: /^seeking$/i });
    const inactiveVisibilityButton = screen.getByRole('button', { name: /^visibility$/i });

    expect(inactiveSeekingButton).toHaveClass('h-8', 'text-[11px]', 'uppercase', 'tracking-[0.18em]');
    expect(inactiveVisibilityButton).toHaveClass('h-8', 'text-[11px]', 'uppercase', 'tracking-[0.18em]');
    expect(inactiveSeekingButton.style.background).toBe('');
    expect(inactiveVisibilityButton.style.background).toBe('');

    fireEvent.click(inactiveSeekingButton);
    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    fireEvent.click(screen.getByRole('option', { name: 'man' }));
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(screen.getByRole('button', { name: /^seeking$/i }).style.background).toBe('var(--cruush-gradient)');

    unmount();

    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      visibility_rules: visibilityRules,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^visibility$/i }).style.background).toBe('var(--cruush-gradient)');
    });
    if ('tags' in visibilityRules) {
      fireEvent.click(screen.getByRole('button', { name: /^visibility$/i }));
      expect(screen.getByRole('button', { name: 'Remove #reviewtag' })).toBeInTheDocument();
    }
  });

  it('opens an incoming cruush actor once and consumes its map deep link', async () => {
    useIsMobile.mockReturnValue(false);
    render(<MemoryRouter initialEntries={['/map?focusUserId=user-1']}>
      <Routes><Route path="/map" element={<><MapHome /><LocationProbe /></>} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByRole('complementary')).toBeInTheDocument();
    expect(getProfileById).toHaveBeenCalledWith('user-1');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
    await waitFor(() => expect(screen.getByTestId('location-probe')).not.toHaveTextContent('focusUserId'));
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'false');
    fireEvent.click(screen.getByRole('button', { name: /close profile/i }));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('restores normal camera framing on a later plain map entry without reopening the actor', async () => {
    useIsMobile.mockReturnValue(false);
    navigator.geolocation.getCurrentPosition = vi.fn();
    render(<MemoryRouter initialEntries={['/map?focusUserId=user-1']}>
      <Routes><Route path="/map" element={<><MapHome /><LocationProbe /><NormalMapNavigationProbe /></>} /></Routes>
    </MemoryRouter>);
    await screen.findByRole('complementary');
    await waitFor(() => expect(screen.getByTestId('location-probe')).not.toHaveTextContent('focusUserId'));
    fireEvent.click(screen.getByRole('button', { name: /close profile/i }));
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Normal map entry' }));
    await waitFor(() => expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'true'));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('opens an incoming cruush profile on mobile and consumes the return link', async () => {
    useIsMobile.mockReturnValue(true);
    window.localStorage.setItem('cruush.desktopPageLayout', 'fullscreen');
    render(<MemoryRouter initialEntries={['/map?focusUserId=user-1']}>
      <Routes>
        <Route path="/map" element={<MapHome />} />
        <Route path="/profile/:userId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>);
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/profile/user-1');
  });

  it('opens a cruush actor outside discovery through the guarded profile route', async () => {
    getNearbyUsers.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/map?focusUserId=missing-actor']}>
      <Routes>
        <Route path="/map" element={<MapHome />} />
        <Route path="/profile/:userId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>);
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/profile/missing-actor');
  });

  it('opens the desktop popup instead of navigating immediately', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Show recently active bar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));

    expect(screen.queryByText('nyc open beta')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'message', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send cruush/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveClass('fixed');
    // Stacking is per panel so a click raises the pressed panel above the other,
    // and every panel stays under the chrome, the nav, and any dialog.
    const panelZIndex = Number(screen.getByRole('complementary').style.zIndex);
    expect(panelZIndex).toBeGreaterThanOrEqual(200);
    expect(panelZIndex).toBeLessThan(900);
    expect(screen.getByRole('complementary')).toHaveAttribute('data-dock-slot', 'left');
    expect(screen.getByTestId('desktop-dock-left-handle')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-dock-left-resize')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-dock-left-resize-top')).toBeInTheDocument();
    expect(screen.getByRole('complementary').querySelector('.profile-card-scroll')).toBeInTheDocument();
    expect(screen.getByRole('complementary').querySelector('.scrollbar-hide')).not.toBeInTheDocument();
    expect(screen.getByTestId('recently-active-panel')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Basics' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Intimacy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Health' })).toBeInTheDocument();
    const intimacyTab = screen.getByRole('tab', { name: 'Intimacy' });
    fireEvent.pointerDown(intimacyTab, { button: 0, ctrlKey: false });
    fireEvent.click(intimacyTab);
    await waitFor(() => expect(intimacyTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Switch')).toBeInTheDocument();
    expect(getProfileById).toHaveBeenCalledWith('user-1');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
  });

  it('blocks a selected desktop map popup user and removes them from the current map state', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Show recently active bar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));
    expect(await screen.findByRole('button', { name: 'message', exact: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Block Jordan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(screen.queryByTestId('marker-user-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Jordan profile' })).not.toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('Jordan blocked.');
  });

  it('reports a selected desktop map profile without closing the popup', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Show recently active bar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Report Jordan' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Reason' }));
    const reason = await screen.findByRole('option', { name: 'Impersonation' });
    fireEvent.pointerDown(reason, { button: 0, pointerType: 'touch' });
    fireEvent.pointerUp(reason, { button: 0, pointerType: 'touch' });
    fireEvent.click(reason);
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(createReport).toHaveBeenCalledWith({
      targetType: 'profile',
      targetId: 'user-1',
      reason: 'impersonation',
      details: undefined,
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report submitted.');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByTestId('marker-user-1')).toBeInTheDocument();
  });

  it('refreshes map users after sending a cruush from the popup without a browser alert', async () => {
    useIsMobile.mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Show recently active bar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));
    fireEvent.click(screen.getByRole('button', { name: /send cruush/i }));

    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Jordan',
    })));
    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('locks the map profile cruush button while the request is pending', async () => {
    useIsMobile.mockReturnValue(false);
    let resolveCruush: (value: unknown) => void = () => {};
    sendCruush.mockReturnValue(new Promise((resolve) => {
      resolveCruush = resolve;
    }));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Show recently active bar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));
    const cruushButton = await screen.findByRole('button', { name: /send cruush/i });

    fireEvent.click(cruushButton);
    fireEvent.click(cruushButton);

    expect(sendCruush).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'sending cruush' })).toBeDisabled();

    resolveCruush({
      id: 'cruush-1',
      fromUserId: 'me',
      toUserId: 'user-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      mutual: false,
    });
  });

  it('requests geolocation on map entry after sign-in and uses approximate coordinates', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(syncMyLocation).toHaveBeenCalledWith({
        lat: expect.any(Number),
        lng: expect.any(Number),
        fuzz_radius_meters: expect.any(Number),
      });
      expect(getNearbyUsers).toHaveBeenLastCalledWith({
        lat: expect.any(Number),
        lng: expect.any(Number),
      }, undefined, { limit: 500 });
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-photo', 'https://example.com/me.jpg');
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-badge', 'bottom');
    });
    expect(syncMyLocation.mock.calls[0]?.[0]?.lat).not.toBe(40.701);
    expect(syncMyLocation.mock.calls[0]?.[0]?.lng).not.toBe(-73.901);
    expect(getNearbyUsers.mock.calls.at(-1)?.[0]).not.toEqual({ lat: 40.701, lng: -73.901 });
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Now');
  });

  it('keeps Ghost Mode settings available on the map', async () => {
    useIsMobile.mockReturnValue(false);
    window.localStorage.removeItem('cruush:ghost-mode-intro-seen');

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
          <Route path="/privacy/ghost-mode" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Ghost Mode Settings' })).toBeInTheDocument();
    expect(screen.queryByText('Ghost Mode protects your map location')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ghost Mode Settings' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/privacy/ghost-mode');
    expect(window.localStorage.getItem('cruush:ghost-mode-intro-seen')).toBeNull();
  });

  it('sizes the active Dark Room mark like the other top navigation glyphs', async () => {
    useIsMobile.mockReturnValue(false);
    getMyPrivacySettings.mockResolvedValue({
      baseMode: 'STEALTH',
      ghostModeEnabled: false,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: 0,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    const darkRoomMark = (await screen.findByRole('button', { name: 'Ghost Mode Settings' })).querySelector('svg');
    // Every top-bar glyph uses the same restored 44px icon box.
    expect(darkRoomMark).toHaveClass('!h-11', '!w-11');
    expect(darkRoomMark).not.toHaveClass('!h-10');
    expect(darkRoomMark).not.toHaveClass('!w-10');
    expect(darkRoomMark).not.toHaveClass('max-[360px]:!h-9');
    expect(darkRoomMark).not.toHaveClass('scale-[1.12]');
    expect(darkRoomMark?.querySelector('[data-dark-room-part="housing"]')).toHaveAttribute('fill-rule', 'evenodd');
    expect(darkRoomMark?.querySelector('[data-dark-room-part="keyhole"]')).not.toBeInTheDocument();
    expect(darkRoomMark?.querySelector('[data-dark-room-part="eye"]')).toBeInTheDocument();
  });

  it('passes an explicit own profile photo to the true self marker while Ghost Mode is active', async () => {
    useIsMobile.mockReturnValue(false);
    getMyProfile.mockResolvedValue({
      ...((await import('../lib/profileApi')).emptyProfilePayload),
      id: 'me',
      display_name: 'Me',
      photos: ['https://example.com/me-explicit.jpg'],
      photo_metadata: [{ url: 'https://example.com/me-explicit.jpg', explicit: true }],
      updated_at: '2026-08-11T12:00:00.000Z',
    });
    getMyPrivacySettings.mockResolvedValue({
      baseMode: 'GHOST',
      ghostModeEnabled: true,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: 0,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    const marker = await screen.findByTestId('marker-me');
    expect(marker).toHaveAttribute('data-display-mode', 'PRECISE');
    expect(marker).toHaveAttribute('data-photo-explicit', 'true');
  });

  it('requests geolocation again after a same-session reload when no saved location exists', async () => {
    useIsMobile.mockReturnValue(false);
    window.sessionStorage.setItem('cruush-location-permission-prompted', 'true');

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Now');
      expect(screen.getByTestId('map-focus')).not.toHaveAttribute('data-lat', '');
      expect(screen.getByTestId('map-focus')).not.toHaveAttribute('data-lng', '');
    });
  });

  it('centers the fresh browser location from the compact pin button', async () => {
    useIsMobile.mockReturnValue(false);
    window.sessionStorage.setItem('cruush-location-permission-prompted', 'true');
    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      location: {
        id: 'me',
        lat: 40.7128,
        lng: -74.006,
        fuzzy_lat: 40.713,
        fuzzy_lng: -74.005,
        fuzz_radius_meters: 250,
        location_updated_at: '2026-06-02T12:00:00.000Z',
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await openMapControls();
    await waitFor(() => expect(screen.getByRole('button', { name: /center your location/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: /center your location/i }));

    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: true,
        maximumAge: 0,
      })
    );
    await waitFor(() => {
      expect(mapControls.setCenter).toHaveBeenCalledWith([-73.901, 40.701]);
      // Centering on yourself lands at the zoom the map opens you at.
      expect(mapControls.setZoom).toHaveBeenCalledWith(14);
      expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lat', '40.701');
      expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lng', '-73.901');
    });
  });

  it('shows a truthful error when explicit map recentering cannot update the shared location', async () => {
    useIsMobile.mockReturnValue(false);
    const displayLocationToken = {
      version: 1 as const,
      tokenId: 'owner-token',
      keyId: 'owner-key',
      ciphertext: 'encrypted-location',
      nonce: 'nonce',
      expiresAtMs: Date.now() + 60_000,
      tokenVersion: 1 as const,
    };
    getMyProfile.mockResolvedValue({
      ...((await import('../lib/profileApi')).emptyProfilePayload),
      id: 'me',
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      location: {
        id: 'me',
        display_location_token: displayLocationToken,
        display_expires_at_ms: displayLocationToken.expiresAtMs,
        display_mode: 'PRECISE',
        animation_hint: 'NONE',
        location_updated_at: '2026-08-12T17:00:00.000Z',
      },
    });
    syncMyLocation.mockRejectedValueOnce(new Error('Location update failed.'));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await openMapControls();
    const centerButton = await screen.findByRole('button', { name: 'Center your location' });
    fireEvent.click(centerButton);

    await waitFor(() => expect(syncMyLocation).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(LOCATION_SYNC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(mapControls.setCenter).toHaveBeenCalledWith([-73.901, 40.701]);
    expect(screen.getByRole('button', { name: 'Center your location' })).toBeEnabled();
  });

  it('shows the signed-in user marker from their saved profile location', async () => {
    useIsMobile.mockReturnValue(false);
    window.sessionStorage.setItem('cruush-location-permission-prompted', 'true');
    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      location: {
        id: 'me',
        lat: 40.7128,
        lng: -74.006,
        fuzzy_lat: 40.713,
        fuzzy_lng: -74.005,
        fuzz_radius_meters: 250,
        location_updated_at: '2026-06-02T12:00:00.000Z',
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lat', '40.713');
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lng', '-74.005');
    });
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Now');
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-photo', 'https://example.com/me.jpg');
  });

  it('does not render a duplicate discovery pin when the API includes the signed-in user', async () => {
    useIsMobile.mockReturnValue(false);
    window.sessionStorage.setItem('cruush-location-permission-prompted', 'true');
    getMyProfile.mockResolvedValue({
      id: 'me',
      display_name: 'Me',
      photos: ['https://example.com/me.jpg'],
      location: {
        id: 'me',
        fuzzy_lat: 40.713,
        fuzzy_lng: -74.005,
        fuzz_radius_meters: 250,
      },
    });
    getNearbyUsers.mockResolvedValue([
      {
        id: 'me',
        name: 'Me',
        display_name: 'Me',
        age: 32,
        pronouns: 'they/them',
        lat: 40.713,
        lng: -74.005,
        lastActive: 'Now',
        distance: 'You',
        lookingFor: [],
        vibes: [],
        position: [],
        hostingTravel: [],
        photo: 'https://example.com/me.jpg',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('marker-me')).toBeInTheDocument());
    expect(screen.getAllByTestId('marker-me')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Pin Me' })).not.toBeInTheDocument();
  });

  it('uses a saved NYC account location on entry without prompting for browser geolocation', async () => {
    useIsMobile.mockReturnValue(false);
    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      location: {
        id: 'me',
        lat: 40.7128,
        lng: -74.006,
        fuzzy_lat: 40.713,
        fuzzy_lng: -74.005,
        fuzz_radius_meters: 250,
        location_updated_at: '2026-06-02T12:00:00.000Z',
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lat', '40.713');
      expect(getNearbyUsers).toHaveBeenLastCalledWith({
        lat: 40.713,
        lng: -74.005,
      }, undefined, { limit: 500 });
    });
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Now');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lat', '40.713');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lng', '-74.005');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'false');
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('uses the saved display-token location for initial discovery', async () => {
    useIsMobile.mockReturnValue(false);
    window.sessionStorage.setItem('cruush-location-permission-prompted', 'true');
    const displayLocationToken = {
      version: 1 as const,
      tokenId: 'owner-token',
      keyId: 'owner-key',
      ciphertext: 'encrypted-location',
      nonce: 'nonce',
      expiresAtMs: Date.now() + 60_000,
      tokenVersion: 1 as const,
    };

    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      location: {
        id: 'me',
        display_location_token: displayLocationToken,
        display_expires_at_ms: displayLocationToken.expiresAtMs,
        display_mode: 'PRECISE',
        animation_hint: 'NONE',
        location_updated_at: '2026-06-02T12:00:00.000Z',
      },
    });
    decryptDisplayLocationToken.mockResolvedValueOnce({
      version: 1,
      subjectUserId: 'me',
      viewerUserId: 'me',
      displayMode: 'PRECISE',
      latE7: 407128000,
      lonE7: -740060000,
      accuracyDisplayM: 250,
      rotationEpoch: null,
      subjectPolicyVersion: 1,
      relationshipGrantVersion: 0,
      expiresAtMs: displayLocationToken.expiresAtMs,
      animationHint: 'NONE',
      renderNonce: 'render-nonce',
      latitude: 40.7128,
      longitude: -74.006,
    });
    getMyPrivacySettings.mockResolvedValueOnce({
      baseMode: 'GHOST',
      ghostModeEnabled: true,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: Date.now(),
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalledTimes(1));

    expect(decryptDisplayLocationToken).toHaveBeenCalledWith(displayLocationToken);
    expect(getNearbyUsers.mock.calls[0]).toEqual([
      {
        lat: 40.7128,
        lng: -74.006,
      },
      undefined,
      { limit: 500 },
    ]);
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-display-mode', 'PRECISE');
    expect(screen.getByTestId('marker-me')).not.toHaveAttribute('data-animation-hint');
    expect(screen.getByTestId('marker-me')).not.toHaveAttribute('data-ghost-rotation-expires-at');
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lat', '40.7128');
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lng', '-74.006');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-circle', '1609');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-lat', '40.7128');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-lng', '-74.006');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'false');
    const ghostModeIconSource = decodeURIComponent(
      screen.getByRole('button', { name: 'Ghost Mode Settings' }).querySelector('img')?.getAttribute('src') ?? ''
    );
    expect(ghostModeIconSource).toContain('ghost-mode-fill');
    expect(ghostModeIconSource).toContain('#0BA8FF');
    expect(ghostModeIconSource).toContain('0.15');
    expect(screen.queryByText('Ghost Mode Active')).not.toBeInTheDocument();
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('shows the owner Ghost leash by default and hides its line and radius while retaining pins when off', async () => {
    useIsMobile.mockReturnValue(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-12T20:00:00.000Z'));
    const rotationExpiresAtMs = Date.now() + 1_000;
    const preciseToken = {
      version: 1 as const,
      tokenId: 'owner-precise-token',
      keyId: 'owner-key',
      ciphertext: 'encrypted-precise-location',
      nonce: 'precise-nonce',
      expiresAtMs: Date.now() + 60_000,
      tokenVersion: 1 as const,
    };
    const ghostToken = {
      ...preciseToken,
      tokenId: 'owner-ghost-token',
      ciphertext: 'encrypted-ghost-location',
      nonce: 'ghost-nonce',
    };
    const rotatedGhostToken = {
      ...ghostToken,
      tokenId: 'owner-ghost-token-rotated',
      ciphertext: 'encrypted-rotated-ghost-location',
    };
    const profile = {
      ...((await import('../lib/profileApi')).emptyProfilePayload),
      id: 'me',
      display_name: 'Me',
      signal: 'Come say hi',
      photos: ['https://example.com/me.jpg'],
      updated_at: '2026-08-12T19:00:00.000Z',
      location: {
        id: 'me',
        display_location_token: preciseToken,
        display_expires_at_ms: preciseToken.expiresAtMs,
        ghost_display_location_token: ghostToken,
        ghost_display_expires_at_ms: ghostToken.expiresAtMs,
        display_mode: 'PRECISE' as const,
        animation_hint: 'NONE' as const,
        location_updated_at: '2026-08-12T19:00:00.000Z',
      },
    };
    getMyProfile
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce({
        ...profile,
        location: {
          ...profile.location,
          ghost_display_location_token: rotatedGhostToken,
        },
      });
    getMyPrivacySettings
      .mockResolvedValueOnce({
        baseMode: 'GHOST',
        ghostModeEnabled: true,
        ghostRadiusMeters: 1609,
        ghostRadiusLabel: '1 mi',
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        preciseLocationVisibility: 'none',
        updatedAtMs: Date.now(),
        ghostRotationExpiresAtMs: rotationExpiresAtMs,
      })
      .mockResolvedValueOnce({
        baseMode: 'GHOST',
        ghostModeEnabled: true,
        ghostRadiusMeters: 1609,
        ghostRadiusLabel: '1 mi',
        preciseToMutualCruushes: false,
        preciseToMutualCrowds: [],
        preciseLocationVisibility: 'none',
        updatedAtMs: Date.now(),
        ghostRotationExpiresAtMs: rotationExpiresAtMs + 15 * 60 * 1000,
        ghostLeashVisible: false,
      });
    decryptDisplayLocationToken.mockImplementation(async (token) => {
      const rotated = token.tokenId === rotatedGhostToken.tokenId;
      const ghost = token.tokenId === ghostToken.tokenId || rotated;

      return {
        version: 1,
        subjectUserId: 'me',
        viewerUserId: 'me',
        displayMode: ghost ? 'GHOST' : 'PRECISE',
        latE7: ghost ? (rotated ? 407180000 : 407160000) : 407128000,
        lonE7: ghost ? (rotated ? -740010000 : -740020000) : -740060000,
        accuracyDisplayM: ghost ? 1609 : 25,
        rotationEpoch: ghost ? (rotated ? 2 : 1) : null,
        subjectPolicyVersion: 3,
        relationshipGrantVersion: 0,
        expiresAtMs: token.expiresAtMs,
        animationHint: 'NONE' as const,
        renderNonce: `render-${token.tokenId}`,
        latitude: ghost ? (rotated ? 40.718 : 40.716) : 40.7128,
        longitude: ghost ? (rotated ? -74.001 : -74.002) : -74.006,
      };
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    const trueMarker = await screen.findByTestId('marker-me');
    const ghostMarker = await screen.findByTestId('marker-me-ghost-decoy');
    const mapFocus = screen.getByTestId('map-focus');
    expect(trueMarker).toHaveAttribute('data-display-mode', 'PRECISE');
    expect(trueMarker).toHaveAttribute('data-lat', '40.7128');
    expect(trueMarker).toHaveAttribute('data-lng', '-74.006');
    expect(ghostMarker).toHaveAttribute('data-display-mode', 'GHOST');
    expect(ghostMarker).toHaveAttribute('data-lat', '40.716');
    expect(ghostMarker).toHaveAttribute('data-lng', '-74.002');
    expect(ghostMarker).toHaveAttribute('data-photo', 'https://example.com/me.jpg');
    // Ghost Mode moves where people see you, not who you are. Everyone else
    // reads the real signal on the decoy, so this preview has to as well.
    expect(ghostMarker).toHaveAttribute('data-signal', 'Come say hi');
    expect(ghostMarker).not.toHaveAttribute('data-signal', 'Ghost Mode decoy');
    expect(mapFocus).toHaveAttribute('data-radius-circle', '1609');
    expect(mapFocus).toHaveAttribute('data-radius-lat', '40.7128');
    expect(mapFocus).toHaveAttribute('data-radius-lng', '-74.006');
    expect(mapFocus).toHaveAttribute('data-ghost-leash-from-lat', '40.7128');
    expect(mapFocus).toHaveAttribute('data-ghost-leash-from-lng', '-74.006');
    expect(mapFocus).toHaveAttribute('data-ghost-leash-to-lat', '40.716');
    expect(mapFocus).toHaveAttribute('data-ghost-leash-to-lng', '-74.002');
    expect(decryptDisplayLocationToken).toHaveBeenCalledWith(ghostToken);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_300);
    });

    await waitFor(() => {
      expect(screen.getByTestId('marker-me-ghost-decoy')).toHaveAttribute('data-lat', '40.718');
      expect(screen.getByTestId('map-focus')).toHaveAttribute('data-ghost-leash-to-lng', '');
      expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-circle', '');
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lat', '40.7128');
    });
    expect(decryptDisplayLocationToken).toHaveBeenCalledWith(rotatedGhostToken);
    vi.useRealTimers();
  });

  it('does not expose the retired NPC Ghost Test discovery path for developer tools sessions', async () => {
    useIsMobile.mockReturnValue(false);
    window.sessionStorage.setItem('cruush-location-permission-prompted', 'true');
    const discoveryUsers = [{
      id: 'user-1',
      name: 'Jordan',
      display_name: 'Jordan',
      age: 26,
      pronouns: 'they/them',
      lat: 40.7,
      lng: -73.9,
      lastActive: '2m ago',
      distance: '0.2 mi',
      lookingFor: ['Fun'],
      vibes: ['Goth'],
      position: ['Top'],
      hostingTravel: ['Can Host'],
      photo: null,
      displayMode: 'PRECISE' as const,
    }];

    getNearbyUsers.mockResolvedValue(discoveryUsers);
    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      location: {
        id: 'me',
        lat: 40.7128,
        lng: -74.006,
        fuzzy_lat: 40.713,
        fuzzy_lng: -74.005,
        fuzz_radius_meters: 250,
        location_updated_at: '2026-06-02T12:00:00.000Z',
      },
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome developerToolsEnabled />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalledTimes(1));

    const lastDiscoveryCall = getNearbyUsers.mock.calls[getNearbyUsers.mock.calls.length - 1];
    expect(screen.queryByRole('switch', { name: 'NPC Ghost Test' })).not.toBeInTheDocument();
    expect(lastDiscoveryCall?.[2]).toEqual({ limit: 500 });
    expect(screen.queryByText('Ghost Mode Active')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-circle', '');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-demo-radius-circles', '0');
    expect(screen.getByTestId('marker-user-1')).toHaveAttribute('data-npc-ghost-demo', 'false');
  });

  it('passes discovery badge metadata and last active labels into map markers', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Pin Jordan' })).toBeInTheDocument();
    expect(screen.getByTestId('marker-user-1')).toHaveAttribute('data-last-active', '2m ago');
    expect(screen.getByTestId('marker-user-1')).toHaveAttribute('data-badge', 'top');

    const recentToggle = screen.getByRole('button', { name: 'Show recently active bar' });
    const recentPanel = screen.getByTestId('recently-active-panel');

    expect(recentToggle).toHaveAttribute('aria-expanded', 'false');
    expect(recentPanel).toHaveClass('max-w-max', 'p-0');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    const recentTray = screen.getByTestId('recently-active-tray');
    const recentTile = screen.getByTestId('recently-active-tile-user-1');
    const recentMedia = recentTile.firstElementChild;

    expect(recentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(recentToggle).toHaveTextContent('Recently Active');
    expect(recentToggle.parentElement).toHaveClass('justify-center');
    expect(recentToggle).toHaveStyle({ background: 'var(--cruush-gradient)' });
    // 0327eaf unified the Recently Active-to-bottom-nav gap to 5.75rem at every
    // breakpoint; desktop no longer uses its own 6.25rem value.
    expect(recentPanel.parentElement).toHaveClass('bottom-[calc(5.75rem+env(safe-area-inset-bottom))]', 'left-0', 'right-0', 'z-[130]');
    expect(recentPanel.parentElement).not.toHaveClass('bottom-[calc(6.25rem+env(safe-area-inset-bottom))]');
    expect(recentPanel).toHaveClass('max-w-[35.75rem]', 'rounded-2xl', 'bg-[color:var(--cruush-black-glass)]', 'backdrop-blur-[var(--cruush-black-glass-blur)]', 'px-[5px]', 'py-3');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('justify-center', 'overflow-hidden');
    expect(screen.getByTestId('recently-active-tray')).not.toHaveClass('scrollbar-subtle', 'pb-2');
    expect(screen.getByTestId('recently-active-tray')).toHaveAttribute('data-scrollable', 'false');
    expect(screen.getByTestId('recently-active-tray')).toHaveStyle({ width: '6.25rem', maxWidth: '100%' });
    expect(screen.getByTestId('recently-active-tray')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('recently-active-tray').style.touchAction).toBe('pan-x');
    expect(screen.getByTestId('recently-active-tray').style.getPropertyValue('-webkit-overflow-scrolling')).toBe('touch');
    const recentImage = recentTile.querySelector('img');
    expect(recentImage).not.toBeNull();
    fireEvent.error(recentImage!);
    const fallback = await screen.findByTestId('recently-active-fallback-user-1');
    expect(fallback).toBeInTheDocument();
    expect(fallback.querySelector('img')).toHaveClass('h-14', 'w-14');
    fireEvent.click(recentTile);
    expect(await screen.findByRole('button', { name: 'message', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close profile preview' }));
    expect(recentTray).toHaveAttribute('data-scrollable', 'false');
    expect(screen.queryByText('Last Active')).not.toBeInTheDocument();
    expect(screen.queryByText('2m ago')).not.toBeInTheDocument();
    expect(screen.queryByText('Jordan')).not.toBeInTheDocument();
    expect(screen.queryByText('0.2 mi')).not.toBeInTheDocument();
    expect(recentTile).toHaveClass('w-[6.25rem]');
    expect(recentMedia?.className).toContain('aspect-[4/5]');
    expect(within(recentTray).queryByText(/./)).not.toBeInTheDocument();

    const restoredRecentToggle = screen.getByRole('button', { name: 'Hide recently active bar' });
    fireEvent.click(restoredRecentToggle);

    expect(restoredRecentToggle).toHaveAttribute('aria-expanded', 'false');
    expect(restoredRecentToggle).toHaveAccessibleName('Show recently active bar');
    expect(restoredRecentToggle).toHaveTextContent('Recently Active');
    expect(restoredRecentToggle).toHaveClass('bg-[color:var(--cruush-black-glass)]', 'backdrop-blur-[var(--cruush-black-glass-blur)]');
    const restoredRecentPanel = screen.getByTestId('recently-active-panel');
    expect(restoredRecentPanel).toHaveClass('max-w-max', 'p-0');
    expect(restoredRecentPanel).not.toHaveClass('rounded-2xl', 'bg-background/40', 'p-3');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(restoredRecentToggle);

    expect(restoredRecentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(restoredRecentToggle).toHaveAccessibleName('Hide recently active bar');
    expect(restoredRecentToggle).toHaveTextContent('Recently Active');
    expect(restoredRecentPanel).toHaveClass('max-w-[35.75rem]', 'rounded-2xl', 'bg-[color:var(--cruush-black-glass)]', 'backdrop-blur-[var(--cruush-black-glass-blur)]', 'px-[5px]', 'py-3');
    expect(screen.getByTestId('recently-active-tray')).toBeInTheDocument();
  });

  it('caps Recently Active at five visible cards and keeps up to ten profiles horizontally reachable without a visible scrollbar', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({
      id: `user-${index + 1}`,
      name: `User ${index + 1}`,
      display_name: `User ${index + 1}`,
      age: 25 + index,
      pronouns: 'they/them',
      lat: 40.7 + index * 0.001,
      lng: -73.9 - index * 0.001,
      lastActive: `${index + 1}m ago`,
      distance: `${index + 1} mi`,
      lookingFor: [],
      vibes: [],
      position: [],
      role: [],
      hostingTravel: [],
      photo: null,
    })));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Show recently active bar' }));
    const recentTray = await screen.findByTestId('recently-active-tray');
    expect(recentTray).toHaveAttribute('data-scrollable', 'true');
    expect(recentTray).toHaveClass('overflow-x-auto', 'scrollbar-hide', 'snap-x', 'snap-mandatory', 'scroll-px-0');
    expect(recentTray).not.toHaveClass('pb-2', 'scrollbar-subtle');
    expect(recentTray).toHaveStyle({ width: '34.25rem', maxWidth: '100%' });
    expect(within(recentTray).getAllByRole('button')).toHaveLength(10);
    expect(screen.getByTestId('recently-active-tile-user-10')).toBeInTheDocument();
    expect(screen.queryByTestId('recently-active-tile-user-11')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recently-active-tile-user-12')).not.toBeInTheDocument();

    fireEvent.wheel(recentTray, { deltaY: 96 });
    expect(recentTray.scrollLeft).toBe(96);

    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(pointerDown, {
      clientX: { value: 140 },
      pointerId: { value: 1 },
    });
    const pointerMove = new Event('pointermove', { bubbles: true });
    Object.defineProperties(pointerMove, {
      clientX: { value: 90 },
      pointerId: { value: 1 },
    });
    const pointerUp = new Event('pointerup', { bubbles: true });
    Object.defineProperties(pointerUp, {
      clientX: { value: 90 },
      pointerId: { value: 1 },
    });

    fireEvent(recentTray, pointerDown);
    fireEvent(recentTray, pointerMove);
    fireEvent(recentTray, pointerUp);
    expect(recentTray.scrollLeft).toBe(146);

    const pointer = (type: string, clientX: number, buttons = 1) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: 2 },
        pointerType: { value: 'mouse' },
        buttons: { value: buttons },
      });
      fireEvent(recentTray, event);
    };

    pointer('pointerdown', 90);
    pointer('pointermove', 236);
    expect(recentTray.scrollLeft).toBe(0);
    pointer('lostpointercapture', 236, 0);
    pointer('pointermove', 190);
    expect(recentTray.scrollLeft).toBe(0);

    pointer('pointerdown', 190);
    pointer('pointermove', 140);
    expect(recentTray.scrollLeft).toBe(50);
    // A release outside the window must not leave movement tied to the mouse.
    pointer('pointermove', 100, 0);
    pointer('pointermove', 80, 0);
    expect(recentTray.scrollLeft).toBe(50);
  });

  it('does not crash when pointer capture is rejected while dragging recently active', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Show recently active bar' }));
    const recentTray = await screen.findByTestId('recently-active-tray');
    recentTray.setPointerCapture = vi.fn(() => {
      throw new DOMException('Pointer capture is no longer available', 'InvalidStateError');
    });
    recentTray.releasePointerCapture = vi.fn(() => {
      throw new DOMException('Pointer capture is no longer available', 'InvalidStateError');
    });

    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(pointerDown, {
      clientX: { value: 140 },
      pointerId: { value: 1 },
    });
    const pointerMove = new Event('pointermove', { bubbles: true });
    Object.defineProperties(pointerMove, {
      clientX: { value: 90 },
      pointerId: { value: 1 },
    });
    const pointerUp = new Event('pointerup', { bubbles: true });
    Object.defineProperties(pointerUp, {
      clientX: { value: 90 },
      pointerId: { value: 1 },
    });

    expect(() => {
      fireEvent(recentTray, pointerDown);
      fireEvent(recentTray, pointerMove);
      fireEvent(recentTray, pointerUp);
    }).not.toThrow();
  });

  it('hides developer-only map demo tools for regular users and bank reviewers', async () => {
    useIsMobile.mockReturnValue(false);
    window.sessionStorage.setItem('cruush-location-permission-prompted', 'true');
    getNearbyUsers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalled());

    expect(screen.queryByRole('switch', { name: 'NPC Ghost Test' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo NYC pin/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin Mika Demo' })).not.toBeInTheDocument();
  });

  it('greys mutual discovery markers and exposes the popup mutual-revoke action', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([{
      id: 'user-1',
      name: 'Jordan',
      display_name: 'Jordan',
      age: 26,
      pronouns: 'they/them',
      lat: 40.7,
      lng: -73.9,
      lastActive: '2m ago',
      distance: '0.2 mi',
      lookingFor: ['Fun'],
      vibes: ['Goth'],
      position: ['Top'],
      hostingTravel: ['Can Host'],
      photo: null,
      relationship: {
        mutualCruush: true,
        canMessage: true,
      },
    }]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pin Jordan' }));

    expect(screen.getByTestId('marker-user-1')).toHaveAttribute('data-relationship', 'mutual_cruush');
    expect(screen.getByTestId('marker-user-1')).toHaveAttribute('data-can-message', 'true');
    const mutualButton = screen.getByRole('button', { name: 'Uncruush Jordan' });
    expect(mutualButton).toBeEnabled();

    fireEvent.click(mutualButton);
    await waitFor(() => expect(revokeMutualCruush).toHaveBeenCalledWith('user-1'));
    expect(sendCruush).not.toHaveBeenCalled();
  });

  it('shows the existing DL icon for masked Recently Active photos', async () => {
    const [base] = await getNearbyUsers();
    getNearbyUsers.mockResolvedValue([{ ...base, photo: 'https://example.com/photo.jpg', photoExplicit: true }]);
    window.localStorage.setItem('cruush:dl-mode-enabled', 'true');
    render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Pin Jordan' });
    fireEvent.click(screen.getByRole('button', { name: 'Show recently active bar' }));
    const fallback = screen.getByTestId('recently-active-fallback-user-1');
    expect(fallback.querySelector('[data-testid="dl-mode-mark"]')).toHaveAttribute('data-tone', 'white');
    expect(fallback.querySelector('[data-testid="dl-mode-photo-placeholder"]')).toHaveClass('opacity-75');
    expect(fallback.querySelector('[data-testid="dl-mode-photo-placeholder"]')).toHaveClass('h-14', 'w-14');
    expect(fallback.querySelectorAll('text')).toHaveLength(0);
    expect(fallback.querySelector('img')).toBeNull();
  });

  it('loads mutual-only map pins from the cruushes query mode', async () => {
    useIsMobile.mockReturnValue(false);
    getMutualCruushMap.mockResolvedValue([{
      id: 'match-1',
      matchId: 'match-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      locked: false,
      user: {
        id: 'user-mutual',
        name: 'River',
        pronouns: 'they/them',
        photo: 'https://example.com/river.jpg',
        photoExplicit: true,
      },
      mutualCrowds: ['T4T'],
      vibes: ['Goth'],
      distance: '0.4 mi away',
      lastActive: 'Active now',
      canMessage: true,
      canRevealPreciseLocation: true,
      coordinates: {
        lat: 40.731,
        lng: -73.991,
        precision: 'precise',
      },
    }]);

    render(
      <MemoryRouter initialEntries={['/map?mode=mutuals']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Pin River' })).toBeInTheDocument();
    await openMapControls();
    expect(getMutualCruushMap).toHaveBeenCalledTimes(1);
    expect(getNearbyUsers).not.toHaveBeenCalled();
    expect(screen.queryByTestId('map-beta-stack')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SEEKING/ })).toBeInTheDocument();
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-relationship', 'mutual_cruush');
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-precision', 'precise');
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-photo-explicit', 'true');
    expect(screen.queryByText(/Demo NYC pin/i)).not.toBeInTheDocument();
  });

  it('focuses the requested mutual pin from the map query', async () => {
    useIsMobile.mockReturnValue(false);
    getMutualCruushMap.mockResolvedValue([{
      id: 'match-1',
      matchId: 'match-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      locked: false,
      user: {
        id: 'user-mutual',
        name: 'River',
        pronouns: 'they/them',
        photo: 'https://example.com/river.jpg',
      },
      mutualCrowds: ['T4T'],
      vibes: ['Goth'],
      distance: '0.4 mi away',
      lastActive: 'Active now',
      canMessage: true,
      canRevealPreciseLocation: true,
      coordinates: {
        lat: 40.731,
        lng: -73.991,
        precision: 'precise',
      },
    }]);

    render(
      <MemoryRouter initialEntries={['/map?mode=mutuals&focusUserId=user-mutual']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Pin River' })).toBeInTheDocument();
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lat', '40.731');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lng', '-73.991');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'false');
  });

  it('keeps a nearby notification Ghost pin at server-authorized coordinates without focusing a non-mutual', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([{
      id: 'user-ghost',
      name: 'River',
      display_name: 'River',
      age: 29,
      pronouns: 'they/them',
      lat: 40.721,
      lng: -73.981,
      lastActive: '4m ago',
      distance: 'Nearby',
      lookingFor: ['Dates'],
      vibes: ['Chill'],
      position: [],
      hostingTravel: [],
      photo: null,
      displayMode: 'GHOST',
      privacyRadiusMeters: 1609,
    }]);

    render(
      <MemoryRouter initialEntries={['/map?focusUserId=user-ghost']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Pin River' })).toBeInTheDocument();
    expect(screen.getByTestId('marker-user-ghost')).toHaveAttribute('data-display-mode', 'GHOST');
    expect(screen.getByTestId('marker-user-ghost')).toHaveAttribute('data-lat', '40.721');
    expect(screen.getByTestId('marker-user-ghost')).toHaveAttribute('data-lng', '-73.981');
    expect(screen.getByTestId('map-focus')).not.toHaveAttribute('data-lat', '40.721');
    expect(screen.getByTestId('map-focus')).not.toHaveAttribute('data-lng', '-73.981');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'false');
  });

  it('does not inject a developer-only demo NYC pin when discovery returns no nearby users', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome developerToolsEnabled />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalled());

    expect(screen.queryByRole('switch', { name: 'NPC Ghost Test' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo NYC pin/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin Mika Demo' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-demo-nyc-connected-pin')).not.toBeInTheDocument();
    expect(sendCruush).not.toHaveBeenCalled();
  });

  it('shows an error instead of fake nearby users when discovery fails', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockRejectedValue(new Error('Discovery offline'));

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Discovery offline')).toBeInTheDocument();
    expect(screen.queryByText(/Demo NYC pin/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin Jordan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin Mika Demo' })).not.toBeInTheDocument();
  });

  it('applies independent Spot categories while preserving the master visibility switch', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);

    await openMapControls();
    fireEvent.click(await screen.findByTestId('map-places-button'));
    fireEvent.click(await screen.findByText(/^Spot filters/));
    expect(screen.getByRole('button', { name: /^Spot filters/ })).toHaveAttribute('data-slot', 'accordion-trigger');
    const buses = await screen.findByRole('switch', { name: 'Show Bus stops' });
    const parks = screen.getByRole('switch', { name: 'Show Park' });
    expect(buses).not.toBeChecked();
    expect(parks).toBeChecked();
    fireEvent.click(buses);
    fireEvent.click(parks);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({
      excludedFacilityTypes: ['park'],
    })));

    const allSpots = screen.getByRole('switch', { name: 'Show Spots on the map' });
    expect(allSpots.closest('div')).toHaveClass('w-fit', 'rounded-full');
    fireEvent.click(allSpots);
    expect(allSpots).not.toBeChecked();
    expect(window.localStorage.getItem('cruush:map-spots-hidden')).toBe('true');
    expect(saveMyMapSpotsVisibility).toHaveBeenLastCalledWith(false);
    fireEvent.click(allSpots);
    expect(allSpots).toBeChecked();
    expect(window.localStorage.getItem('cruush:map-spots-hidden')).toBe('false');
    expect(saveMyMapSpotsVisibility).toHaveBeenLastCalledWith(true);
  });

  it('restores the account-backed Spot visibility preference when browser storage is unavailable', async () => {
    getMyMapSpotsVisibility.mockResolvedValue({ visible: false, saved: true });
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([]);

    render(<MemoryRouter initialEntries={['/map']}><MapHome /></MemoryRouter>);

    await openMapControls();
    fireEvent.click(await screen.findByTestId('map-places-button'));
    const allSpots = await screen.findByRole('switch', { name: 'Show Spots on the map' });
    await waitFor(() => expect(allSpots).not.toBeChecked());
    expect(getMyMapSpotsVisibility).toHaveBeenCalledTimes(1);
  });

  it('keeps Spots on by default when only stale browser storage says hidden', async () => {
    window.localStorage.setItem('cruush:map-spots-hidden', 'true');
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([]);
    getPlaces.mockResolvedValue([{
      id: 'place-1',
      name: 'Sunset Park',
      latitude: 40.73,
      longitude: -73.99,
      facilityType: 'park',
      distanceMiles: 0.2,
    } as unknown as PlaceRecord]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getPlaces).toHaveBeenCalled());
    expect(await screen.findByTestId('marker-place-place-1')).toBeInTheDocument();
    expect(getPlaces).toHaveBeenNthCalledWith(1, expect.objectContaining({
      excludedFacilityTypes: ['bus_stop'],
    }));
    expect(saveMyMapSpotsVisibility).not.toHaveBeenCalled();

    window.localStorage.removeItem('cruush:map-spots-hidden');
  });
});
