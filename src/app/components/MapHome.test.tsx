import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import MapHome from './MapHome';

const { getNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
}));

const { syncMyLocation } = vi.hoisted(() => ({
  syncMyLocation: vi.fn(),
}));

const { useIsMobile } = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
}));

vi.mock('../lib/usersApi', () => ({
  getNearbyUsers,
}));

vi.mock('../lib/locationApi', () => ({
  syncMyLocation,
}));

vi.mock('./ui/use-mobile', () => ({
  useIsMobile,
}));

vi.mock('./MapView', () => ({
  default: ({ users, onPinClick, onMapClick }: { users: any[]; onPinClick: (user: any) => void; onMapClick?: () => void }) => (
    <div>
      <button onClick={() => onMapClick?.()}>Map background</button>
      {users
        .filter((user) => user.id !== 'me')
        .map((user) => (
          <button key={user.id} onClick={() => onPinClick(user)}>
            {`Pin ${user.name}`}
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
    useIsMobile.mockReset();

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
        photo: null,
      },
    ]);
    syncMyLocation.mockReset();
    syncMyLocation.mockResolvedValue({
      id: 'user-1',
      lat: 40.7,
      lng: -73.9,
      fuzzy_lat: 40.7,
      fuzzy_lng: -73.9,
      fuzz_radius_meters: 0,
      location_updated_at: '2026-04-29T12:00:00.000Z',
    });

    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn().mockImplementation((success: (position: { coords: { latitude: number; longitude: number } }) => void) => {
          success({
            coords: {
              latitude: 40.701,
              longitude: -73.901,
            },
          });
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });
  });

  it('navigates directly to the full profile on mobile', async () => {
    useIsMobile.mockReturnValue(true);

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

    fireEvent.click(await screen.findByRole('button', { name: 'Pin Jordan' }));

    expect(screen.getByRole('button', { name: /message now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send cruush/i })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
  });

  it('syncs the current geolocation while loading nearby users', async () => {
    useIsMobile.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Pin Jordan' });

    expect(syncMyLocation).toHaveBeenCalledWith({
      lat: 40.701,
      lng: -73.901,
      fuzz_radius_meters: 0,
    });
    expect(getNearbyUsers).toHaveBeenCalledWith({ lat: 40.701, lng: -73.901 });
  });

  it('shows an explicit empty state when discovery returns no nearby users', async () => {
    useIsMobile.mockReturnValue(false);
    getNearbyUsers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<MapHome />} />
        </Routes>
      </MemoryRouter>
    );

    expect((await screen.findAllByText(/No one nearby yet/i)).length).toBeGreaterThan(0);
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
    expect(screen.queryByText(/No one nearby yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin Jordan' })).not.toBeInTheDocument();
  });
});
