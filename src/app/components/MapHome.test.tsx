import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  },
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const { dismissUserNotice, getUserNoticeDismissal } = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
}));

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
      enable3dBuildings,
      fitToMarkers,
      focusCoordinates,
      radiusCircle,
      demoRadiusCircles = [],
      onPinClick,
      onMapClick,
      onMapReady,
    }: {
      markers: any[];
      enable3dBuildings?: boolean;
      fitToMarkers?: boolean;
      focusCoordinates?: { approximateLatitude: number; approximateLongitude: number } | null;
      radiusCircle?: {
        center: { approximateLatitude: number; approximateLongitude: number };
        radiusMeters: number;
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
            data-3d-buildings={String(Boolean(enable3dBuildings))}
            data-radius-circle={radiusCircle ? String(radiusCircle.radiusMeters) : ''}
            data-radius-lat={radiusCircle ? String(radiusCircle.center.approximateLatitude) : ''}
            data-radius-lng={radiusCircle ? String(radiusCircle.center.approximateLongitude) : ''}
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
              data-relationship={marker.relationship?.kind ?? ''}
              data-can-message={String(marker.relationship?.canMessage ?? '')}
              data-precision={marker.relationship?.precision ?? ''}
              data-display-mode={marker.displayMode ?? ''}
              data-npc-ghost-demo={String(Boolean(marker.npcGhostDemo))}
              key={`marker-data-${marker.id}`}
            />
          ))}
          {markers
            .filter((marker) => marker.id !== 'me')
            .map((marker) => (
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

describe('MapHome', () => {
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
    getMyBillingStatus.mockReset();
    getActiveEvents.mockReset();
    revealEventPass.mockReset();
    emailEventPass.mockReset();
    joinEventChat.mockReset();
    dismissUserNotice.mockReset();
    getUserNoticeDismissal.mockReset();
    useIsMobile.mockReset();
    mapControls.setCenter.mockReset();
    mapControls.setZoom.mockReset();
    mapControls.zoomIn.mockReset();
    mapControls.zoomOut.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.localStorage.setItem('cruush:ghost-mode-intro-seen', 'true');
    window.localStorage.setItem('cruush:map-controls-intro-seen', 'true');
    dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: '2026-07-31T12:00:00.000Z' });
    getUserNoticeDismissal.mockResolvedValue({ dismissed: true, dismissedAt: '2026-07-31T12:00:00.000Z' });
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

  it('navigates directly to the full profile on mobile', async () => {
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
    expect(screen.getByTestId('map-brand-glass')).toHaveClass('cruush-map-logo-shell', 'h-[4.35rem]', 'sm:h-[5rem]');
    expect(screen.getByTestId('map-brand-glass')).not.toHaveClass('rounded-[1.35rem]');
    expect(screen.getByTestId('map-brand-glass').getAttribute('style')).toContain('--cruush-map-logo-mask');
    expect(container.querySelector('img[src*="cruush-logo.svg"]')?.className).toContain('h-full');
    expect(container.querySelector('img[src*="cruush-logo.svg"]')?.className).toContain('w-full');
    expect(screen.getByTestId('map-brand-logo')).toHaveClass('cruush-map-logo-glass');
    expect(screen.getByTestId('map-beta-tag')).toHaveClass('text-[9px]', 'sm:text-[10px]');
    expect(screen.getByText('nyc open beta')).toHaveClass('lowercase');
    expect(screen.getByText('nyc open beta').parentElement).toHaveClass('flex-col', 'items-center');

    fireEvent.click(await screen.findByRole('button', { name: 'Pin Jordan' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-1');
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
    expect(recentPanel).toHaveClass('w-full', 'max-w-full', 'p-2');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('gap-2');
    expect(screen.getByTestId('recently-active-tile-user-1')).toHaveClass('w-16');
    expect(screen.getByTestId('recently-active-tile-user-1').firstElementChild).toHaveClass('overflow-hidden', 'border', 'bg-white/[0.06]');
    expect(within(screen.getByTestId('recently-active-tile-user-1')).queryByRole('img', { name: /heart preview/i })).not.toBeInTheDocument();
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

  it('renders compact map top chrome and toggles DL Mode from the top slot', async () => {
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
    const ghostModeIcon = ghostModeButton.querySelector('img');
    const visibilityIcon = screen.getByRole('button', { name: /visibility/i }).querySelector('img');
    const map3dButton = screen.getByRole('button', { name: 'Turn 3D map on' });
    const locationButton = screen.getByRole('button', { name: /center your location|finding your location/i });

    const topActions = screen.getByTestId('map-top-actions');
    const rightActions = screen.getByTestId('map-right-actions');
    const cruushPlusButton = await screen.findByRole('button', { name: 'cruush+ rewards' });

    expect(screen.getByTestId('map-home-shell')).toHaveClass('relative');
    expect(screen.getByTestId('map-home-shell')).not.toHaveClass('fixed', 'inset-0');
    expect(screen.getByTestId('map-top-chrome')).toHaveClass('pointer-events-none');
    expect(topActions).toHaveClass('pointer-events-auto', 'mt-0', 'gap-0.5', 'p-0.5');
    expect(topActions).not.toHaveClass('mt-11');
    expect(rightActions).toHaveClass('right-3', 'top-[4.5rem]', 'sm:right-4', 'sm:top-[4.75rem]');
    expect(cruushPlusButton).toHaveClass('cruush-logo-font', 'normal-case', 'tracking-normal', 'text-sm', 'sm:text-base');
    expect(screen.queryByRole('button', { name: 'Safety Center' })).not.toBeInTheDocument();
    expect(luckyIcon).toHaveClass('h-5', 'w-5');
    expect(ghostModeIcon).toHaveClass('h-4', 'w-4');
    expect(decodeURIComponent(ghostModeIcon?.getAttribute('src') ?? '')).toContain("fill='#ffffff'");
    expect(ghostModeButton).toHaveAttribute('aria-pressed', 'false');
    expect(visibilityIcon).toHaveClass('h-4', 'w-4');
    expect(decodeURIComponent(visibilityIcon?.getAttribute('src') ?? '')).toContain('Crush Icon - Group White');
    expect(map3dButton).toHaveAttribute('aria-pressed', 'false');
    expect(map3dButton).toHaveClass('cruush-glass-control');
    expect(map3dButton.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(locationButton).toHaveClass('rounded-full', 'cruush-glass-control');
    expect(locationButton.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(screen.queryByText('DL Mode Active')).not.toBeInTheDocument();

    await screen.findByRole('button', { name: 'Pin Jordan' });
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-3d-buildings', 'false');

    fireEvent.click(map3dButton);
    expect(window.localStorage.getItem('cruush:map-3d-mode-enabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Turn 3D map off' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-3d-buildings', 'true');

    fireEvent.click(dlModeButton);
    expect(window.localStorage.getItem('cruush:dl-mode-enabled')).toBe('false');
    expect(screen.queryByTestId('location-probe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn DL Mode on' })).toBeInTheDocument();
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

  it('shows the map controls intro once and dismisses it permanently', async () => {
    useIsMobile.mockReturnValue(false);
    window.localStorage.removeItem('cruush:map-controls-intro-seen');
    getUserNoticeDismissal.mockResolvedValue({ dismissed: false, dismissedAt: null });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Map controls' })).toBeInTheDocument();
    expect(screen.getByText(/Seeking and Visibility live on the right side of the map/i)).toBeInTheDocument();
    expect(screen.getByText(/bug report button stays above the bottom nav and behind open sheets/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Map controls' })).not.toBeInTheDocument());
    expect(window.localStorage.getItem('cruush:map-controls-intro-seen')).toBe('true');
    expect(dismissUserNotice).toHaveBeenCalledWith('cruush:map-controls-intro-seen');

    unmount();

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: /^seeking$/i });
    expect(screen.queryByRole('heading', { name: 'Map controls' })).not.toBeInTheDocument();
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
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('w-fit', 'max-w-[29.5rem]', 'lg:ml-auto', 'lg:mr-0');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('pointer-events-auto');
  });

  it('only shows the Cruush gradient on active seeking and visibility controls', async () => {
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

    expect(screen.getByText('nyc open beta').parentElement).toHaveClass('flex-col', 'items-center');
    expect(screen.getByText('nyc open beta')).toHaveClass('lowercase');
    expect(screen.getByRole('button', { name: /message now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send cruush/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveClass('z-50');
    expect(screen.getByRole('complementary')).toHaveClass('bottom-[calc(0.75rem+env(safe-area-inset-bottom))]');
    expect(screen.getByRole('complementary')).toHaveClass('top-[8.75rem]');
    expect(screen.getByRole('complementary').querySelector('.scrollbar-hide')).toBeInTheDocument();
    expect(screen.getByRole('complementary').querySelector('.scrollbar-subtle')).not.toBeInTheDocument();
    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('left-[calc(23rem+1.5rem)]', 'right-4', 'pl-2', 'pr-0');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('w-fit', 'max-w-[29.5rem]', 'lg:ml-auto', 'lg:mr-0');
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
      }, undefined, { limit: 50 });
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-photo', 'https://example.com/me.jpg');
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-badge', 'bottom');
    });
    expect(syncMyLocation.mock.calls[0]?.[0]?.lat).not.toBe(40.701);
    expect(syncMyLocation.mock.calls[0]?.[0]?.lng).not.toBe(-73.901);
    expect(getNearbyUsers.mock.calls.at(-1)?.[0]).not.toEqual({ lat: 40.701, lng: -73.901 });
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Now');
  });

  it('explains Ghost Mode once after onboarding reaches the map', async () => {
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

    expect(await screen.findByText('Ghost Mode protects your map location')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ghost Mode settings' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/privacy/ghost-mode');
    expect(window.localStorage.getItem('cruush:ghost-mode-intro-seen')).toBe('true');
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
    expect(mapControls.setCenter).toHaveBeenCalledWith([-73.901, 40.701]);
    expect(mapControls.setZoom).toHaveBeenCalledWith(14);
    await waitFor(() => {
      expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lat', '40.701');
      expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lng', '-73.901');
    });
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
      }, undefined, { limit: 50 });
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
      { limit: 50 },
    ]);
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-display-mode', 'GHOST');
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lat', '40.7128');
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-lng', '-74.006');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-circle', '1609');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-lat', '40.7128');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-radius-lng', '-74.006');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-fit-to-markers', 'false');
    const ghostModeButton = screen.getByRole('button', { name: 'Ghost Mode Settings' });
    expect(ghostModeButton).toHaveAttribute('aria-pressed', 'true');
    expect(ghostModeButton).toHaveClass('bg-white/10', 'ring-1', 'ring-white/15');
    expect(decodeURIComponent(ghostModeButton.querySelector('img')?.getAttribute('src') ?? '')).toContain('linear-gradient');
    expect(screen.queryByText('Ghost Mode Active')).not.toBeInTheDocument();
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
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
    expect(lastDiscoveryCall?.[2]).toEqual({ limit: 50 });
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
    expect(recentPanel).toHaveClass('max-w-[29.5rem]', 'p-3');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('cursor-grab', 'overflow-x-auto', 'overscroll-x-contain', 'scroll-smooth');
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
    expect(recentMedia?.className).toContain('overflow-hidden');
    expect(recentMedia?.className).toContain('border');
    expect(recentMedia?.querySelector('.cruush-heart-glass-svg')).toBeNull();
    expect(within(recentTile).queryByRole('img', { name: /heart preview/i })).not.toBeInTheDocument();
    expect(within(recentTray).queryByText(/./)).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAttribute('aria-expanded', 'false');
    expect(recentToggle).toHaveAccessibleName('Show recently active bar');
    expect(recentToggle).toHaveTextContent('Recently Active');
    expect(recentToggle).toHaveClass('cruush-glass-pill');
    expect(recentPanel).toHaveClass('max-w-max', 'p-0');
    expect(recentPanel).not.toHaveClass('rounded-2xl', 'bg-background/40', 'p-3');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(recentToggle).toHaveAccessibleName('Hide recently active bar');
    expect(recentToggle).toHaveTextContent('Recently Active');
    expect(recentPanel).toHaveClass('max-w-[29.5rem]', 'p-3');
    expect(screen.getByTestId('recently-active-tray')).toBeInTheDocument();
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
    expect(screen.getByText('Mutual cruushes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MUTUALS/ })).toBeInTheDocument();
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-relationship', 'mutual_cruush');
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-precision', 'precise');
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
