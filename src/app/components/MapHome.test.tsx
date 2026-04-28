import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import MapHome from './MapHome';

const { getNearbyUsers, buildFallbackNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
  buildFallbackNearbyUsers: vi.fn(),
}));

const { useIsMobile } = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
}));

vi.mock('../lib/usersApi', () => ({
  getNearbyUsers,
  buildFallbackNearbyUsers,
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
    buildFallbackNearbyUsers.mockReset();
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

    buildFallbackNearbyUsers.mockReturnValue([]);

    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn().mockReturnValue(1),
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
});
