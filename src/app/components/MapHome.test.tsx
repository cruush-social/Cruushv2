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

const { getMyProfile } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
}));

const { useIsMobile } = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
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
  };
});

vi.mock('./ui/use-mobile', () => ({
  useIsMobile,
}));

vi.mock('./MapView', () => ({
  createMapMarkerBadge: (position: string[] = [], hostingTravel: string[] = []) => {
    const knownPosition = position.map((value) => value.trim().toLowerCase()).find((value) => ['top', 'bottom', 'versatile'].includes(value));
    return knownPosition ? { kind: 'position', label: knownPosition, iconName: knownPosition } : null;
  },
  default: ({ markers, onPinClick, onMapClick }: { markers: any[]; onPinClick: (marker: any) => void; onMapClick?: () => void }) => (
    <div>
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
  ),
}));

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
    useIsMobile.mockReset();

    getMyProfile.mockResolvedValue({
      photos: ['https://example.com/me.jpg'],
      position: ['Bottom'],
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
    expect(container.querySelector('img[src*="cruush-logo"]')?.className).toContain('h-20');
    expect(container.querySelector('img[src*="cruush-logo"]')?.className).toContain('sm:h-[5.625rem]');

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/profile/user-1');
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

    expect(screen.getByRole('button', { name: /message now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send cruush/i })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
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
    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalledTimes(2));
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('requests geolocation only after the user opts in and uses approximate coordinates', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /use my location/i }));

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

  it('shows the signed-in user marker from their saved profile location', async () => {
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
    const recentToggle = screen.getByRole('button', { name: 'Recently Active' });
    const recentPanel = screen.getByTestId('recently-active-panel');

    expect(recentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(recentPanel).toHaveClass('max-w-5xl', 'p-3');
    expect(screen.queryByText('Last Active')).not.toBeInTheDocument();
    expect(screen.queryByText('2m ago')).not.toBeInTheDocument();
    expect(screen.queryByText('Jordan')).not.toBeInTheDocument();
    expect(screen.queryByText('0.2 mi')).not.toBeInTheDocument();
    expect(recentTile).toHaveClass('w-20');
    expect(recentMedia?.className).toContain('aspect-[4/5]');
    expect(within(recentTray).queryByText(/./)).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAttribute('aria-expanded', 'false');
    expect(recentPanel).toHaveClass('w-fit', 'max-w-[calc(100vw-2rem)]', 'px-4', 'py-2');
    expect(recentPanel).not.toHaveClass('max-w-5xl', 'p-3');
    expect(recentToggle).toHaveClass('mb-0');
    expect(screen.queryByTestId('recently-active-tray')).not.toBeInTheDocument();

    fireEvent.click(recentToggle);

    expect(recentToggle).toHaveAttribute('aria-expanded', 'true');
    expect(recentPanel).toHaveClass('max-w-5xl', 'p-3');
    expect(recentToggle).toHaveClass('mb-2');
    expect(screen.getByTestId('recently-active-tray')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Mutuals/ })).toBeInTheDocument();
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-relationship', 'mutual_cruush');
    expect(screen.getByTestId('marker-user-mutual')).toHaveAttribute('data-precision', 'precise');
    expect(screen.queryByText(/Demo NYC pin/i)).not.toBeInTheDocument();
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
