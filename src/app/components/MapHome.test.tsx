import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import MapHome from './MapHome';

const { getNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
}));

const { getMutualCruushMap } = vi.hoisted(() => ({
  getMutualCruushMap: vi.fn(),
}));

const { sendCruush } = vi.hoisted(() => ({
  sendCruush: vi.fn(),
}));

const { getMyProfile, getProfileById } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  getProfileById: vi.fn(),
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
    getMyProfile,
    getProfileById,
  };
});

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
      focusCoordinates,
      onPinClick,
      onMapClick,
      onMapReady,
    }: {
      markers: any[];
      focusCoordinates?: { approximateLatitude: number; approximateLongitude: number } | null;
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

describe('MapHome', () => {
  beforeEach(() => {
    getNearbyUsers.mockReset();
    getMutualCruushMap.mockReset();
    sendCruush.mockReset();
    getMyProfile.mockReset();
    getProfileById.mockReset();
    useIsMobile.mockReset();
    mapControls.setCenter.mockReset();
    mapControls.setZoom.mockReset();
    mapControls.zoomIn.mockReset();
    mapControls.zoomOut.mockReset();
    window.sessionStorage.clear();

    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
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
    sendCruush.mockResolvedValue({
      id: 'cruush-1',
      fromUserId: 'me',
      toUserId: 'user-1',
      createdAt: '2026-04-29T12:00:00.000Z',
      mutual: true,
    });
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
    expect(container.querySelector('img[src*="cruush-logo.svg"]')?.className).toContain('h-[6.25rem]');
    expect(container.querySelector('img[src*="cruush-logo.svg"]')?.className).toContain('sm:h-[7.03125rem]');

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-1');
  });

  it('renders 25 percent larger Cruush icons on the map controls', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    const luckyIcon = screen.getByRole('button', { name: "I'm Feeling Lucky" }).querySelector('img');
    const visibilityIcon = screen.getByRole('button', { name: /visibility/i }).querySelector('img');
    const locationButton = screen.getByRole('button', { name: /center your location|finding your location/i });

    expect(luckyIcon).toHaveClass('h-[1.5625rem]', 'w-[1.5625rem]');
    expect(visibilityIcon).toHaveClass('h-4', 'w-4');
    expect(locationButton).toHaveClass('rounded-full', 'bg-background/55');
    expect(locationButton.querySelector('svg')).toHaveClass('h-4', 'w-4');

    await screen.findByRole('button', { name: 'Pin Jordan' });
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
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('max-w-[29.5rem]', 'lg:ml-auto', 'lg:mr-0');
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

    expect(screen.getByTestId('map-home-shell')).toHaveClass('h-[100dvh]', 'max-h-[100dvh]', 'overflow-hidden', 'overscroll-none');
    expect(screen.getByTestId('map-top-chrome')).toHaveClass('pointer-events-none', 'z-40');
    expect(screen.getByRole('button', { name: "I'm Feeling Lucky" }).parentElement).toHaveClass('pointer-events-auto');
    expect(screen.getByTestId('map-floating-controls')).toHaveClass('z-50');
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

    expect(screen.getByText('NYC beta').parentElement).toHaveClass('lg:flex-row', 'lg:items-start');
    expect(screen.getByText('NYC beta')).toHaveClass('lg:ml-2', 'lg:mt-0');
    expect(screen.getByRole('button', { name: /message now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send cruush/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveClass('z-50');
    expect(screen.getByRole('complementary')).toHaveClass('bottom-[calc(0.75rem+env(safe-area-inset-bottom))]');
    expect(screen.getByRole('complementary')).toHaveClass('top-[8.75rem]');
    expect(screen.getByRole('complementary').querySelector('.scrollbar-hide')).toBeInTheDocument();
    expect(screen.getByRole('complementary').querySelector('.scrollbar-subtle')).not.toBeInTheDocument();
    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('left-[calc(23rem+1.5rem)]', 'right-4', 'pl-2', 'pr-0');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('max-w-[29.5rem]', 'lg:ml-auto', 'lg:mr-0');
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

  it('right-aligns recently active when the desktop own profile preview is open', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapHome isOwnProfilePreviewOpen />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Open Jordan profile' });

    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('left-[calc(23rem+1.5rem)]', 'right-4', 'pl-2', 'pr-0');
    expect(screen.getByTestId('recently-active-panel')).toHaveClass('max-w-[29.5rem]', 'lg:ml-auto', 'lg:mr-0');
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
      expect(getNearbyUsers).toHaveBeenLastCalledWith({
        lat: expect.any(Number),
        lng: expect.any(Number),
      }, undefined, { limit: 50 });
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-photo', 'https://example.com/me.jpg');
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-badge', 'bottom');
    });
    expect(getNearbyUsers.mock.calls.at(-1)?.[0]).not.toEqual({ lat: 40.701, lng: -73.901 });
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Now');
  });

  it('centers the current approximate location from the compact pin button', async () => {
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

    expect(mapControls.setCenter).toHaveBeenCalledWith([-74.005, 40.713]);
    expect(mapControls.setZoom).toHaveBeenCalledWith(14);
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Saved area');
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-photo', 'https://example.com/me.jpg');
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
    expect(recentPanel.parentElement).toHaveClass('absolute', 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))]', 'left-0');
    expect(recentPanel).toHaveClass('max-w-[29.5rem]', 'p-3');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('cursor-grab', 'overflow-x-auto', 'overscroll-x-contain', 'scroll-smooth', '[touch-action:pan-x]');
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
    expect(recentPanel).toHaveClass('w-full', 'max-w-max', 'p-0');
    expect(recentPanel).not.toHaveClass('rounded-2xl', 'bg-background/40', 'p-3');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(recentToggle).toHaveAccessibleName('Hide recently active bar');
    expect(recentToggle).toHaveTextContent('Recently Active');
    expect(recentPanel).toHaveClass('max-w-[29.5rem]', 'p-3');
    expect(screen.getByTestId('recently-active-tray')).toBeInTheDocument();
  });

  it('keeps mobile map chrome and recently active controls fixed in the visual viewport', async () => {
    useIsMobile.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Pin Jordan' })).toBeInTheDocument();
    expect(screen.getByTestId('map-home-shell')).toHaveClass('h-[100dvh]', 'max-h-[100dvh]', 'overflow-hidden', 'overscroll-none');
    expect(screen.getByTestId('map-top-chrome')).toHaveClass('pointer-events-none', 'z-40');
    expect(screen.getByTestId('map-floating-controls')).toHaveClass('z-50');
    expect(screen.getByTestId('recently-active-panel').parentElement).toHaveClass('fixed', 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))]', 'left-0', 'right-0');
    expect(screen.getByTestId('recently-active-tray')).toHaveClass('[touch-action:pan-x]');
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
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lat', '40.731674');
    expect(screen.getByTestId('map-focus')).toHaveAttribute('data-lng', '-73.989796');
  });

  it('shows a fully designed demo NYC pin when discovery returns no nearby users', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Pin Mika Demo' })).toBeInTheDocument();
    expect(screen.getAllByText('Demo NYC pin').length).toBeGreaterThan(0);
    expect(screen.getByTestId('marker-demo-nyc-connected-pin')).toHaveAttribute('data-badge', 'versatile');
    expect(screen.getByTestId('marker-demo-nyc-connected-pin')).toHaveAttribute('data-last-active', '3m ago');
    expect(screen.getByTestId('marker-demo-nyc-connected-pin').getAttribute('data-photo')).toContain('data:image/svg+xml');

    fireEvent.click(screen.getByRole('button', { name: 'Pin Mika Demo' }));
    expect(screen.getByRole('button', { name: 'Demo profile' })).toBeDisabled();
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
