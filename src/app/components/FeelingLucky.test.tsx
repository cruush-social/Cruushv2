import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeelingLucky from './FeelingLucky';

const { getMyBillingStatus, getNearbyUsers, getMyProfile, getProfileById, decryptDisplayLocationToken } = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
  getNearbyUsers: vi.fn(),
  getMyProfile: vi.fn(),
  getProfileById: vi.fn(),
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
    getProfileById,
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
        <Route path="/rewards" element={<LocationProbe />} />
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
    getProfileById.mockReset();
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

  it('spins real profiles for free users and lands on the cruush+ frame', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });

    renderLucky();

    expect(await screen.findByLabelText('cruise carousel')).toBeInTheDocument();
    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalled());
    expect(await screen.findByTestId('cruise-carousel-plus-ad-tile')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Get cruush+' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/rewards');
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
    getProfileById.mockResolvedValue({
      photos: ['/jordan.jpg', '/jordan-2.jpg', '/jordan-3.jpg', '/jordan-4.jpg'],
      photo_metadata: [
        { url: '/jordan.jpg', explicit: false },
        { url: '/jordan-2.jpg', explicit: false },
        { url: '/jordan-3.jpg', explicit: false },
        { url: '/jordan-4.jpg', explicit: false },
      ],
    });

    const { container } = renderLucky();

    await waitFor(() => expect(getNearbyUsers).toHaveBeenCalledWith(
      { lat: 40.7128, lng: -74.006 },
      undefined,
      { limit: 20 },
    ));
    expect(await screen.findByText(/Jordan/)).toBeInTheDocument();
    const browseAgainButton = screen.getByRole('button', { name: 'Browse again' });
    const profileCard = screen.getByTestId('profile-card');
    expect(profileCard).toContainElement(browseAgainButton);
    expect(profileCard).toHaveClass('h-full', 'min-h-0', 'max-w-2xl');
    expect(profileCard).not.toHaveClass('aspect-[4/5]');
    expect(container.firstElementChild).toHaveClass('pb-[calc(5rem+env(safe-area-inset-bottom))]');
    expect(screen.getByTestId('lucky-profile-result')).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'gap-2');
    expect(screen.getByTestId('profile-card')).not.toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('profile-card-media')).toHaveClass('absolute', 'inset-0');
    expect(screen.getByTestId('carousel-profile-glass')).not.toHaveClass('bg-black/60', 'backdrop-blur-xl');
    expect(screen.getByTestId('carousel-profile-actions')).toContainElement(screen.getByRole('button', { name: 'send cruush' }));
    const secondPhotoHeart = await screen.findByRole('button', { name: 'Show profile photo 2' });
    fireEvent.click(secondPhotoHeart);
    expect(screen.getByTestId('carousel-profile-photo')).toHaveAttribute('src', '/jordan-2.jpg');
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
