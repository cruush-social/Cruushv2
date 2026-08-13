import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ApiClientError } from '../lib/apiClient';
import MapHome, { canUseDeveloperMapToolsEmail } from './MapHome';

const { getNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
}));

const { getMutualCruushMap } = vi.hoisted(() => ({
  getMutualCruushMap: vi.fn(),
}));

const { sendCruush } = vi.hoisted(() => ({
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
}));

vi.mock('../lib/cruushApi', () => ({
  getMutualCruushMap,
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
    default: ({
      markers,
      fitToMarkers,
      focusCoordinates,
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
  return <div data-testid="location-probe">{location.pathname}</div>;
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

describe('MapHome', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the codeveloper NYC account to use developer-only map tools without bank reviewer access', () => {
    expect(canUseDeveloperMapToolsEmail('admin@cruush.local')).toBe(true);
    expect(canUseDeveloperMapToolsEmail(' codeveloper-nyc@cruush.local ')).toBe(true);
    expect(canUseDeveloperMapToolsEmail('bank-reviewer-nyc@cruush.local')).toBe(false);
    expect(canUseDeveloperMapToolsEmail('payment@cruush.local')).toBe(false);
    expect(canUseDeveloperMapToolsEmail(null)).toBe(false);
  });

  beforeEach(async () => {
    getNearbyUsers.mockReset();
    getMutualCruushMap.mockReset();
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
    syncMyLocation.mockReset();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Send a Ping' }));
    const sendButton = await screen.findByRole('button', { name: 'Send Ping' });
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

  it('exposes the real Ping control to the tutorial and opens the Ping sheet', async () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>,
    );

    const pingControl = await screen.findByRole('button', { name: 'Send a Ping' });
    expect(pingControl).toHaveAttribute('data-tutorial-target', 'ping');
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('data-tutorial-target', 'notifications');
    expect(screen.getByRole('button', { name: 'Ghost Mode Settings' })).toHaveAttribute('data-tutorial-target', 'ghost');
    expect(screen.getByTestId('map-top-actions')).toContainElement(pingControl);

    fireEvent.click(pingControl);

    expect(await screen.findByRole('dialog')).toHaveAttribute('data-testid', 'map-ping-sheet');
    expect(screen.getByText('3 of 3 Pings available right now.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Your approximate area')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Send a Ping' }));
    fireEvent.click(await screen.findByRole('radio', { name: '10 miles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Ping' }));

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

    await waitFor(() => expect(sendMapPing).toHaveBeenCalledWith(10, expect.any(String)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ping active' })).toBeDisabled());
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
    fireEvent.click(screen.getByRole('button', { name: 'Send a Ping' }));
    const sendButton = screen.getByRole('button', { name: 'Send Ping' });
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

    fireEvent.click(await screen.findByRole('button', { name: 'Send a Ping' }));
    const sendButton = screen.getByRole('button', { name: 'Send Ping' });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);
    await waitFor(() => expect(sendMapPing).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ping delivery is incomplete. Try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Send Ping' }));
    await waitFor(() => expect(sendMapPing).toHaveBeenCalledTimes(2));

    const firstIdempotencyKey = sendMapPing.mock.calls[0]?.[1];
    const retryIdempotencyKey = sendMapPing.mock.calls[1]?.[1];
    expect(firstIdempotencyKey).toEqual(expect.any(String));
    expect(retryIdempotencyKey).toBe(firstIdempotencyKey);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ping active' })).toBeDisabled());
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

    fireEvent.click(await screen.findByRole('button', { name: 'Send a Ping' }));
    await waitFor(() => expect(getMapPingStatus).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Send Ping' }));
    await waitFor(() => expect(sendMapPing).toHaveBeenCalled());

    getMapPingStatus.mockImplementationOnce(() => staleRefresh.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Send a Ping' }));
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ping active' })).toBeDisabled());

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

    expect(screen.getByRole('button', { name: 'Ping active' })).toBeDisabled();
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
    const setIntervalSpy = vi.spyOn(window, 'setInterval');

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });
    const callsBeforeRefresh = getNearbyUsers.mock.calls.length;
    const privacyRefresh = setIntervalSpy.mock.calls.find(([, delay]) => delay === 10_000)?.[0];

    expect(privacyRefresh).toEqual(expect.any(Function));
    act(() => {
      (privacyRefresh as () => void)();
    });

    await waitFor(() => expect(getNearbyUsers.mock.calls.length).toBeGreaterThan(callsBeforeRefresh));
    expect(screen.getByRole('button', { name: 'Pin Jordan' })).toBeInTheDocument();

    setIntervalSpy.mockRestore();
  });

  it('navigates directly to the full profile on a short mobile tap', async () => {
    useIsMobile.mockReturnValue(true);

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
    });
  });

  it('keeps the recently active button visible above the mobile bottom nav', async () => {
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

    expect(recentPanel.parentElement).toHaveClass('bottom-[calc(6.25rem+env(safe-area-inset-bottom))]', 'left-3', 'right-3', 'z-40');
    expect(recentPanel).toHaveClass('max-w-max', 'p-0');
    expect(recentToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAccessibleName('Hide recently active bar');
    expect(recentPanel).toHaveClass('w-fit', 'max-w-full', 'p-2');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('gap-2');
    expect(screen.getByTestId('recently-active-tile-user-1')).toHaveClass('w-14');
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

  it('hides recently active while launch event details are open', async () => {
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
    expect(screen.queryByTestId('recently-active-panel')).not.toBeInTheDocument();
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

  it('renders responsive map top chrome with larger controls and toggles DL Mode from the top slot', async () => {
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

    const luckyIcon = screen.getByRole('button', { name: 'Cruise Carousel' }).querySelector('img');
    const ghostModeButton = screen.getByRole('button', { name: 'Ghost Mode Settings' });
    const dlModeButton = screen.getByRole('button', { name: 'Turn DL Mode off' });
    const dlModeIcon = dlModeButton.querySelector('img');
    const ghostModeIcon = ghostModeButton.querySelector('img');
    const notificationButton = screen.getByRole('button', { name: 'Notifications' });
    const notificationIcon = notificationButton.querySelector('img');
    const settingsButton = screen.getByRole('button', { name: 'Settings' });
    const settingsIcon = settingsButton.querySelector('img');
    const visibilityIcon = screen.getByRole('button', { name: /visibility/i }).querySelector('img');
    const locationButton = screen.getByRole('button', { name: /center your location|finding your location/i });

    const topActions = screen.getByTestId('map-top-actions');
    const plusStack = screen.getByTestId('map-plus-stack');
    const rightActions = screen.getByTestId('map-right-actions');
    const cruushPlusButton = await screen.findByRole('button', { name: 'cruush+ rewards' });
    const pingButton = screen.getByRole('button', { name: 'Send a Ping' });
    const pingIcon = pingButton.querySelector('svg');

    expect(screen.getByTestId('map-home-shell')).toHaveClass('relative');
    expect(screen.getByTestId('map-home-shell')).not.toHaveClass('fixed', 'inset-0');
    expect(screen.getByTestId('map-top-chrome')).toHaveClass('pointer-events-none');
    expect(topActions).toHaveClass(
      'pointer-events-auto',
      'mt-0',
      'min-w-0',
      'w-full',
      'flex-1',
      'justify-between',
      'gap-0.5',
      'p-1',
      'sm:p-1.5',
      'lg:mx-auto',
      'lg:max-w-[52rem]',
      'lg:flex-none',
    );
    for (const button of [
      screen.getByRole('button', { name: 'Cruise Carousel' }),
      ghostModeButton,
      dlModeButton,
      notificationButton,
      settingsButton,
    ]) {
      expect(button).toHaveClass('size-9', 'sm:size-10', 'lg:size-11');
    }
    expect(topActions).not.toHaveClass('sm:max-w-[34rem]');
    expect(topActions.parentElement).toHaveClass('w-full');
    expect(topActions).not.toHaveClass('mt-11');
    expect(plusStack).toHaveClass('relative', 'shrink-0');
    expect(plusStack).toContainElement(cruushPlusButton);
    expect(plusStack).toContainElement(pingButton);
    expect(cruushPlusButton.nextElementSibling).toBe(pingButton);
    expect(topActions).toContainElement(cruushPlusButton);
    expect(topActions).toContainElement(pingButton);
    expect(pingButton).toHaveClass(
      'absolute',
      'left-1/2',
      'top-full',
      'mt-3.5',
      'sm:mt-5',
      'lg:mt-4',
      '-translate-x-1/2',
      'lg:size-11',
    );
    expect(pingButton).not.toHaveClass('mt-2');
    expect(rightActions).toHaveClass('right-3', 'top-[3.875rem]', 'sm:right-4', 'sm:top-[4.875rem]');
    expect(cruushPlusButton).toHaveClass(
      'cruush-plus-shimmer-button',
      'cruush-logo-font',
      'normal-case',
      'tracking-normal',
      'h-9',
      'px-3',
      'text-base',
      'sm:h-10',
      'sm:px-3.5',
      'sm:text-lg',
      'lg:h-11',
      'lg:px-4',
      'lg:text-xl',
    );
    expect(screen.queryByRole('button', { name: 'Safety Center' })).not.toBeInTheDocument();
    expect(pingIcon).toHaveClass('h-5', 'w-5', 'lg:h-7', 'lg:w-7');
    expect(luckyIcon).toHaveClass('h-[1.375rem]', 'w-[1.375rem]', 'scale-[1.55]', 'sm:h-6', 'sm:w-6', 'lg:h-7', 'lg:w-7');
    expect(ghostModeIcon).toHaveClass('h-[1.375rem]', 'w-[1.375rem]', 'sm:h-6', 'sm:w-6', 'lg:h-7', 'lg:w-7');
    expect(dlModeIcon).toHaveClass('h-[1.375rem]', 'w-[1.375rem]', 'sm:h-6', 'sm:w-6', 'lg:h-7', 'lg:w-7');
    expect(notificationIcon).toHaveClass('h-[1.375rem]', 'w-[1.375rem]', 'scale-[1.4]', 'sm:h-6', 'sm:w-6', 'lg:h-7', 'lg:w-7');
    expect(settingsIcon).toHaveClass('h-[1.375rem]', 'w-[1.375rem]', 'scale-[1.18]', 'sm:h-6', 'sm:w-6', 'lg:h-7', 'lg:w-7');
    expect(dlModeIcon?.getAttribute('src')).toContain('dl-mode-colored');
    expect(decodeURIComponent(ghostModeIcon?.getAttribute('src') ?? '')).toContain("fill='#ffffff'");
    expect(visibilityIcon).toHaveClass('h-4', 'w-4');
    expect(decodeURIComponent(visibilityIcon?.getAttribute('src') ?? '')).toContain('Crush Icon - Group White'); // ai-contract-allow-product-example
    expect(locationButton).toHaveClass('rounded-full', 'bg-background/55');
    expect(locationButton.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(screen.queryByText('DL Mode Active')).not.toBeInTheDocument();

    await screen.findByRole('button', { name: 'Pin Jordan' });

    fireEvent.click(dlModeButton);
    expect(window.localStorage.getItem('cruush:dl-mode-enabled')).toBe('false');
    expect(screen.queryByTestId('location-probe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn DL Mode on' }).querySelector('img')?.getAttribute('src'))
      .toContain('dl-mode-white');
  });

  it('shows one combined active crowd notice on the map', async () => {
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

    expect(await screen.findByText('Dyke, Gay, and T4T Crowds Active')).toBeInTheDocument();
    expect(screen.queryByText(/^Dyke Crowd Active$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Gay Crowd Active$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^T4T Crowd Active$/)).not.toBeInTheDocument();
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

    expect(await screen.findByText('Your profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
  });

  it('opens an eligible map-discovered profile in the desktop side panel from Cruise Carousel', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Cruise Carousel' }));

    expect(screen.getByLabelText('cruise carousel')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
    expect(await screen.findByText('Nearby now')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /message now/i })).toBeInTheDocument();
    expect(getProfileById).toHaveBeenCalledWith('user-1');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
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

    fireEvent.click(screen.getByRole('button', { name: 'Cruise Carousel' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/lucky');
  });

  it('opens rewards from the top cruush+ button', async () => {
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
          <Route path="/rewards" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'cruush+ rewards' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/rewards');
  });

  it('shows the locked cruise carousel side panel for free desktop users', async () => {
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

    expect(await screen.findByRole('button', { name: 'cruush+ rewards' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cruise Carousel' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
    expect(screen.getByLabelText('cruise carousel')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Get cruush+' })).toBeInTheDocument();
    expect(screen.queryByText('Nearby now')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Get cruush+' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/rewards');
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

    fireEvent.click(screen.getByRole('button', { name: /^seeking$/i }));

    expect(screen.getByRole('heading', { name: 'Seeking' })).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: /^visibility$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^visibility$/i }));

    expect(screen.getByRole('heading', { name: 'Visibility' })).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: /^visibility$/i }));
    const dialog = screen.getByRole('dialog', { name: 'Visibility' });
    expect(within(dialog).getByText('Basic includes up to 3 hidden filters.')).toBeInTheDocument();
  });

  it('runs install and notification permission actions from the tutorial', async () => {
    useIsMobile.mockReturnValue(false);
    window.localStorage.removeItem('cruush:tutorial-v4-seen');
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: false });
    const installRequested = vi.fn();
    window.addEventListener('cruush:install-requested', installRequested);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Install cruush' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    expect(installRequested).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByTestId('tutorial-skip-step'));
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    await waitFor(() => expect(enablePushNotifications).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Seeking' })).toBeInTheDocument();

    window.removeEventListener('cruush:install-requested', installRequested);
  });

  it('shows the map controls intro once and dismisses it permanently', async () => {
    useIsMobile.mockReturnValue(false);
    window.localStorage.removeItem('cruush:tutorial-v4-seen');
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: false });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('map-controls-tutorial')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Install cruush' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    expect(screen.getByRole('heading', { name: 'Seeking' })).toBeInTheDocument();
    expect(screen.getByText(/filters the people you see on the map/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Visibility' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Crowd Mode' })).toBeInTheDocument();
    expect(screen.getByText(/only people in those crowds to see you/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    expect(await screen.findByTestId('crowd-mode-tutorial-target')).toHaveAttribute('data-tutorial-target', 'crowds');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'DL Mode' })).toBeInTheDocument();
    expect(screen.getByText(/replaces explicit or NSFW photos with gradients/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    expect(screen.getByRole('button', { name: 'Turn DL Mode on' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Ping' })).toBeInTheDocument();
    expect(screen.getByText(/briefly marks your heart as active on the map/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Zoom' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByText(/start with a short signal, question, or invitation/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));

    await waitFor(() => expect(screen.queryByTestId('map-controls-tutorial')).not.toBeInTheDocument());
    expect(window.localStorage.getItem('cruush:tutorial-v4-seen')).toBe('true');
    expect(markNoticeDismissed).toHaveBeenCalledWith('cruush:tutorial-v4-seen', { offline: false });
    unmount();

    resolveNoticeDismissal.mockResolvedValue({ dismissed: true, offline: false });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: /^seeking$/i });
    expect(screen.queryByTestId('map-controls-tutorial')).not.toBeInTheDocument();
  });

  it('resumes saved tutorial progress even when the completion notice is already dismissed', async () => {
    useIsMobile.mockReturnValue(false);
    window.localStorage.setItem('cruush:tutorial-v4-seen', 'true');
    window.localStorage.setItem('cruush:tutorial-v4-progress', 'ghost');
    resolveNoticeDismissal.mockResolvedValue({ dismissed: true, offline: false });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();
    expect(screen.getByTestId('map-controls-tutorial')).toBeInTheDocument();
  });

  it('ignores malformed saved tutorial progress when the tutorial is dismissed', async () => {
    useIsMobile.mockReturnValue(false);
    window.localStorage.setItem('cruush:tutorial-v4-seen', 'true');
    window.localStorage.setItem('cruush:tutorial-v4-progress', 'not-a-tutorial-step');
    resolveNoticeDismissal.mockResolvedValue({ dismissed: true, offline: false });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: /^seeking$/i });
    await waitFor(() => expect(resolveNoticeDismissal).toHaveBeenCalledWith('cruush:tutorial-v4-seen'));
    expect(window.localStorage.getItem('cruush:tutorial-v4-progress')).toBe('not-a-tutorial-step');
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    expect(screen.queryByTestId('map-controls-tutorial')).not.toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: /^visibility$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^visibility$/i }));

    expect(screen.getByRole('heading', { name: 'Visibility' })).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: /^visibility$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^visibility$/i }));
    fireEvent.click(screen.getByRole('switch', { name: 'Distance' }));
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => expect(saveMyVisibilityRules).toHaveBeenCalledWith(expect.objectContaining({
      active_crowd_modes: [],
      distance: 100,
      age_range: null,
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

    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('left-0', 'right-4', 'pl-4', 'pr-0');
    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('w-fit', 'max-w-[30rem]', 'lg:ml-auto', 'lg:mr-0');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('pointer-events-auto');
  });

  it('only shows the cruush gradient on active seeking and visibility controls', async () => {
    useIsMobile.mockReturnValue(false);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    const inactiveSeekingButton = screen.getByRole('button', { name: /^seeking$/i });
    const inactiveVisibilityButton = screen.getByRole('button', { name: /^visibility$/i });

    expect(inactiveSeekingButton).toHaveClass('h-8', 'text-[11px]', 'uppercase', 'tracking-[0.18em]');
    expect(inactiveVisibilityButton).toHaveClass('h-8', 'text-[11px]', 'uppercase', 'tracking-[0.18em]');
    expect(inactiveSeekingButton.style.background).toBe('');
    expect(inactiveVisibilityButton.style.background).toBe('');

    fireEvent.click(inactiveSeekingButton);
    fireEvent.click(screen.getByRole('button', { name: 'Gender Identities' }));
    fireEvent.click(screen.getByRole('option', { name: 'man' }));
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(screen.getByRole('button', { name: /^seeking$/i }).style.background).toBe('var(--cruush-gradient)');

    unmount();

    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
      visibility_rules: {
        distance: 25,
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
      expect(screen.getByRole('button', { name: /^visibility$/i }).style.background).toBe('var(--cruush-gradient)');
    });
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

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));

    expect(screen.queryByText('nyc open beta')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /message now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send cruush/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveClass('z-50');
    expect(screen.getByRole('complementary')).toHaveClass('bottom-[calc(0.75rem+env(safe-area-inset-bottom))]');
    expect(screen.getByRole('complementary')).toHaveClass('top-[8.75rem]');
    expect(screen.getByRole('complementary').querySelector('.scrollbar-hide')).toBeInTheDocument();
    expect(screen.getByRole('complementary').querySelector('.scrollbar-subtle')).not.toBeInTheDocument();
    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('left-[calc(23rem+1.5rem)]', 'right-4', 'pl-2', 'pr-0');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('w-fit', 'max-w-[30rem]', 'lg:ml-auto', 'lg:mr-0');
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

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));
    expect(await screen.findByRole('button', { name: /message now/i })).toBeInTheDocument();

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

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Report Jordan' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'impersonation' } });
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

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));
    fireEvent.click(screen.getByRole('button', { name: /send cruush/i }));

    await waitFor(() => expect(sendCruush).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Jordan',
    })));
    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalledTimes(3));
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
    expect(decodeURIComponent(screen.getByRole('button', { name: 'Ghost Mode Settings' }).querySelector('img')?.getAttribute('src') ?? '')).toContain('linear-gradient');
    expect(decodeURIComponent(screen.getByText('Ghost Mode Active').querySelector('img')?.getAttribute('src') ?? '')).toContain('linear-gradient');
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('shows the signed-in user true and shared Ghost pins with a true-location radius and rotating leash', async () => {
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
      expect(screen.getByTestId('map-focus')).toHaveAttribute('data-ghost-leash-to-lng', '-74.001');
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

    const recentTray = screen.getByTestId('recently-active-tray');
    const recentTile = screen.getByTestId('recently-active-tile-user-1');
    const recentMedia = recentTile.firstElementChild;
    const recentToggle = screen.getByRole('button', { name: 'Hide recently active bar' });
    const recentPanel = screen.getByTestId('recently-active-panel');

    expect(recentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(recentToggle).toHaveTextContent('Recently Active');
    expect(recentToggle.parentElement).toHaveClass('justify-end');
    expect(recentToggle).toHaveStyle({ background: 'var(--cruush-gradient)' });
    expect(recentPanel.parentElement).toHaveClass('bottom-[calc(6.25rem+env(safe-area-inset-bottom))]', 'left-0');
    expect(recentPanel).toHaveClass('max-w-[30rem]', 'p-3');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('cursor-grab', 'overflow-x-hidden', 'overscroll-x-contain', 'scroll-smooth');
    expect(screen.getByTestId('recently-active-tray')).not.toHaveClass('scrollbar-subtle', 'pb-1');
    expect(screen.getByTestId('recently-active-tray')).toHaveAttribute('data-scrollable', 'false');
    expect(screen.getByTestId('recently-active-tray')).toHaveStyle({ width: '5rem', maxWidth: '100%' });
    expect(screen.getByTestId('recently-active-tray')).toHaveAttribute('tabindex', '0');
    fireEvent.click(recentTile);
    expect(await screen.findByRole('button', { name: /message now/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close profile preview' }));
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
    expect(screen.queryByText('Last Active')).not.toBeInTheDocument();
    expect(screen.queryByText('2m ago')).not.toBeInTheDocument();
    expect(screen.queryByText('Jordan')).not.toBeInTheDocument();
    expect(screen.queryByText('0.2 mi')).not.toBeInTheDocument();
    expect(recentTile).toHaveClass('w-20');
    expect(recentMedia?.className).toContain('aspect-[4/5]');
    expect(within(recentTray).queryByText(/./)).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAttribute('aria-expanded', 'false');
    expect(recentToggle).toHaveAccessibleName('Show recently active bar');
    expect(recentToggle).toHaveTextContent('Recently Active');
    expect(recentToggle).toHaveStyle({ background: 'rgba(0, 0, 0, 0.82)' });
    expect(recentPanel).toHaveClass('max-w-max', 'p-0');
    expect(recentPanel).not.toHaveClass('rounded-2xl', 'bg-background/40', 'p-3');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(recentToggle).toHaveAccessibleName('Hide recently active bar');
    expect(recentToggle).toHaveTextContent('Recently Active');
    expect(recentPanel).toHaveClass('max-w-[30rem]', 'p-3');
    expect(screen.getByTestId('recently-active-tray')).toBeInTheDocument();
  });

  it('caps Recently Active at five visible cards and shows a slim scrollbar for up to ten sorted profiles', async () => {
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

    const recentTray = await screen.findByTestId('recently-active-tray');
    expect(recentTray).toHaveAttribute('data-scrollable', 'true');
    expect(recentTray).toHaveClass('overflow-x-auto', 'pb-1', 'scrollbar-subtle');
    expect(recentTray).not.toHaveClass('scrollbar-hide');
    expect(recentTray).toHaveStyle({ width: '28rem', maxWidth: '100%' });
    expect(within(recentTray).getAllByRole('button')).toHaveLength(10);
    expect(screen.getByTestId('recently-active-tile-user-10')).toBeInTheDocument();
    expect(screen.queryByTestId('recently-active-tile-user-11')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recently-active-tile-user-12')).not.toBeInTheDocument();
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

  it('greys mutual discovery markers and disables the popup cruush action', async () => {
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
    const mutualButton = screen.getByRole('button', { name: 'Already mutual' });
    expect(mutualButton).toBeDisabled();

    fireEvent.click(mutualButton);
    expect(sendCruush).not.toHaveBeenCalled();
  });

  it('loads mutual-only map pins from the mutuals query mode', async () => {
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
    expect(getMutualCruushMap).toHaveBeenCalledTimes(1);
    expect(getNearbyUsers).not.toHaveBeenCalled();
    expect(screen.getByText('mutual cruushes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MUTUALS/ })).toBeInTheDocument();
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-relationship', 'mutual_cruush');
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-precision', 'precise');
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-photo-explicit', 'true');
    expect(screen.queryByText(/Demo NYC pin/i)).not.toBeInTheDocument();
  });

  it('focuses the requested mutual cruush pin from the map query', async () => {
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
});
