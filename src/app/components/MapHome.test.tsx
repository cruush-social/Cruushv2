import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import MapHome from './MapHome';

const { getNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
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

vi.mock('../lib/profileApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/profileApi')>()),
  getMyProfile,
}));

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
          data-last-active={marker.lastActiveLabel ?? ''}
          data-photo={marker.photo ?? ''}
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
      });
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-photo', 'https://example.com/me.jpg');
      expect(screen.getByTestId('marker-me')).toHaveAttribute('data-badge', 'bottom');
    });
    expect(getNearbyUsers.mock.calls.at(-1)?.[0]).not.toEqual({ lat: 40.701, lng: -73.901 });
    expect(screen.getByTestId('marker-me')).toHaveAttribute('data-last-active', 'Now');
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

    expect(screen.getByText('Recently Active')).toBeInTheDocument();
    expect(screen.queryByText('Last Active')).not.toBeInTheDocument();
    expect(screen.queryByText('2m ago')).not.toBeInTheDocument();
    expect(screen.queryByText('Jordan')).not.toBeInTheDocument();
    expect(screen.queryByText('0.2 mi')).not.toBeInTheDocument();
    expect(recentTile).toHaveClass('w-20');
    expect(recentMedia?.className).toContain('aspect-[4/5]');
    expect(within(recentTray).queryByText(/./)).not.toBeInTheDocument();
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
