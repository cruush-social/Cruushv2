import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import MapHome from './MapHome';

const { getNearbyUsers } = vi.hoisted(() => ({
  getNearbyUsers: vi.fn(),
}));

const { useIsMobile } = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
}));

vi.mock('../lib/usersApi', () => ({
  getNearbyUsers,
}));

vi.mock('./ui/use-mobile', () => ({
  useIsMobile,
}));

vi.mock('./MapView', () => ({
  default: ({ markers, onPinClick, onMapClick }: { markers: any[]; onPinClick: (marker: any) => void; onMapClick?: () => void }) => (
    <div>
      <button onClick={() => onMapClick?.()}>Map background</button>
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

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapHome /><LocationProbe /></>} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'cruush' })).toHaveClass('cruush-logo-text');

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
    });
    expect(getNearbyUsers.mock.calls.at(-1)?.[0]).not.toEqual({ lat: 40.701, lng: -73.901 });
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
