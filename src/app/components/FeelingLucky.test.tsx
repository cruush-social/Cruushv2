import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeelingLucky from './FeelingLucky';

const { getMyBillingStatus, getNearbyUsers, getMyProfile, decryptDisplayLocationToken } = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
  getNearbyUsers: vi.fn(),
  getMyProfile: vi.fn(),
  decryptDisplayLocationToken: vi.fn(),
}));

vi.mock('../lib/billingApi', () => ({
  getMyBillingStatus,
}));

vi.mock('../lib/usersApi', () => ({
  getNearbyUsers,
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
  };
});

vi.mock('../lib/displayLocationTokens', () => ({
  decryptDisplayLocationToken,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderLucky() {
  return render(
    <MemoryRouter initialEntries={['/lucky']}>
      <Routes>
        <Route path="/lucky" element={<><FeelingLucky /><LocationProbe /></>} />
        <Route path="/upgrade" element={<LocationProbe />} />
        <Route path="/profile/:userId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FeelingLucky', () => {
  beforeEach(() => {
    getMyBillingStatus.mockReset();
    getNearbyUsers.mockReset();
    getMyProfile.mockReset();
    decryptDisplayLocationToken.mockReset();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the locked slot result for free users without fetching profiles', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    renderLucky();

    expect(await screen.findByLabelText('cruise carousel')).toBeInTheDocument();
    expect(getMyProfile).not.toHaveBeenCalled();
    expect(getNearbyUsers).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Get cruush+' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/upgrade');
  });

  it('fetches nearby profiles for cruush+ users and lands on a profile', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: true,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    getMyProfile.mockResolvedValue({
      location: {
        fuzzy_lat: 40.7128,
        fuzzy_lng: -74.006,
      },
    });
    getNearbyUsers.mockResolvedValue([{
      id: 'user-jordan',
      name: 'Jordan',
      display_name: 'Jordan',
      age: 26,
      pronouns: 'they/them',
      lat: 40.713,
      lng: -74.005,
      lastActive: '2m ago',
      distance: '0.2 mi',
      lookingFor: ['Fun'],
      vibes: ['Goth'],
      position: ['Top'],
      role: [],
      hostingTravel: ['Can Host'],
      photo: null,
    }]);

    renderLucky();

    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalledWith(
      { lat: 40.7128, lng: -74.006 },
      undefined,
      { limit: 20 },
    ));
    expect(await screen.findByText(/Jordan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spin again' })).toBeInTheDocument();
  });

  it('treats billing failures as locked and does not reveal profile data', async () => {
    getMyBillingStatus.mockRejectedValue(new Error('billing offline'));

    renderLucky();

    expect(await screen.findByLabelText('cruise carousel')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Get cruush+' })).toBeInTheDocument();
    expect(getMyProfile).not.toHaveBeenCalled();
    expect(getNearbyUsers).not.toHaveBeenCalled();
  });
});
