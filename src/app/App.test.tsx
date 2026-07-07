import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const { loadCurrentSession, persistSessionUser } = vi.hoisted(() => ({
  loadCurrentSession: vi.fn(),
  persistSessionUser: vi.fn(),
}));

vi.mock('./lib/sessionUser', () => ({
  loadCurrentSession,
  persistSessionUser,
}));

vi.mock('./components/MapHome', () => ({
  default: () => <div>Mock Map</div>,
  canUseDeveloperMapToolsEmail: () => false,
  isDevelopmentAdminEmail: () => false,
}));

vi.mock('./components/LocalFeed', () => ({
  default: () => <div>Mock Feed</div>
}));

vi.mock('./components/ProfileView', () => ({
  default: () => <div>Mock Profile</div>
}));

vi.mock('./components/ProfileEdit', () => ({
  default: () => <div>Mock Profile Edit</div>
}));

vi.mock('./components/ProfileOnboarding', () => ({
  default: () => <div>Mock Onboarding</div>
}));

vi.mock('./components/CodeOfConductGate', () => ({
  default: () => <div>Mock Code Gate</div>
}));

vi.mock('./components/FiltersPanel', () => ({
  default: () => <div>Mock Filters</div>
}));

vi.mock('./components/GroupDetail', () => ({
  default: () => <div>Mock Group</div>
}));

vi.mock('./components/EventDetail', () => ({
  default: () => <div>Mock Event</div>
}));

vi.mock('./components/PlaceDetail', () => ({
  default: () => <div>Mock Place</div>
}));

vi.mock('./components/PrivateGroupChat', () => ({
  default: () => <div>Mock Group Chat</div>
}));

vi.mock('./components/DirectMessages', () => ({
  default: () => <div>Mock Messages</div>
}));

vi.mock('./components/ReportPage', () => ({
  default: () => <div>Mock Report</div>
}));

vi.mock('./components/CruushActivity', () => ({
  default: () => <div>Mock Cruush</div>
}));

vi.mock('./components/Auth', () => ({
  default: ({ onAuth }: { onAuth: (session: {
    user: {
      id: string;
      email: string;
      displayName: string;
      emailVerifiedAt: string;
      createdAt: string;
    };
    profile: null;
    needsOnboarding: boolean;
    needsCodeOfConduct: boolean;
    codeOfConductVersion: string;
    acceptedCodeOfConductVersion: string | null;
    codeOfConductAcceptedAt: string | null;
  }) => void }) => (
    <button
      onClick={() => onAuth({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
          emailVerifiedAt: '2026-04-28T12:00:00.000Z',
          createdAt: '2026-04-28T12:00:00.000Z',
        },
        profile: null,
        needsOnboarding: false,
        needsCodeOfConduct: false,
        codeOfConductVersion: '2026-07-07',
        acceptedCodeOfConductVersion: '2026-07-07',
        codeOfConductAcceptedAt: '2026-07-07T15:00:00.000Z',
      })}
    >
      Mock Auth
    </button>
  )
}));

vi.mock('./components/EmailVerificationGate', () => ({
  default: () => <div>Mock Verify Gate</div>
}));

vi.mock('./components/VerifyEmail', () => ({
  default: () => <div>Mock Verify Email</div>
}));

vi.mock('./components/ResetPassword', () => ({
  default: () => <div>Mock Reset Password</div>
}));

vi.mock('./components/Settings', () => ({
  default: () => <div>Mock Settings</div>
}));

vi.mock('./components/GhostModeSettings', () => ({
  default: () => <div>Mock Ghost Mode Settings</div>
}));

vi.mock('./components/FeelingLucky', () => ({
  default: () => <div>Mock Lucky</div>
}));

vi.mock('./components/CruushPlusUpgrade', () => ({
  default: () => <div>Mock Upgrade</div>
}));

vi.mock('./components/CruushPlusCheckout', () => ({
  default: () => <div>Mock Checkout</div>
}));

vi.mock('./components/CruushPlusSuccess', () => ({
  default: () => <div>Mock Checkout Success</div>
}));

vi.mock('./components/RequestsDashboard', () => ({
  default: () => <div>Mock Requests</div>
}));

vi.mock('./components/BottomNav', () => ({
  default: () => <nav aria-label="Bottom Navigation">Mock Bottom Nav</nav>
}));

vi.mock('./components/DebugCruushPlusToggle', () => ({
  default: () => <div data-testid="debug-cruush-plus-toggle" />
}));

vi.mock('./components/ui/sonner', () => ({
  Toaster: () => <div data-testid="toaster" />
}));

describe('App', () => {
  const acceptedConductSession = {
    needsCodeOfConduct: false,
    codeOfConductVersion: '2026-07-07',
    acceptedCodeOfConductVersion: '2026-07-07',
    codeOfConductAcceptedAt: '2026-07-07T15:00:00.000Z',
  };

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    loadCurrentSession.mockReset();
    persistSessionUser.mockReset();
  });

  it('renders the authenticated shell on the map by default', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });

    render(<App />);

    expect(await screen.findByText('Mock Map')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Bottom Navigation' })).toBeInTheDocument();
  });

  it('redirects to /map after login', async () => {
    loadCurrentSession.mockResolvedValue(null);
    window.history.replaceState({}, '', '/feed');

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mock Auth' }));

    expect(await screen.findByText('Mock Map')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/map');
  });

  it('renders the reset password route while signed out', async () => {
    loadCurrentSession.mockResolvedValue(null);
    window.history.replaceState({}, '', '/reset-password?token=reset-token-1234567890');

    render(<App />);

    expect(await screen.findByText('Mock Reset Password')).toBeInTheDocument();
  });

  it('renders the verification route from the root verification token query', async () => {
    loadCurrentSession.mockResolvedValue(null);
    window.history.replaceState({}, '', '/?verifyEmailToken=verification-token-1234567890');

    render(<App />);

    expect(await screen.findByText('Mock Verify Email')).toBeInTheDocument();
  });

  it('renders the reset password route from the root reset token query', async () => {
    loadCurrentSession.mockResolvedValue(null);
    window.history.replaceState({}, '', '/?resetPasswordToken=reset-token-1234567890');

    render(<App />);

    expect(await screen.findByText('Mock Reset Password')).toBeInTheDocument();
  });

  it('renders the reset password route while signed in', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/reset-password?token=reset-token-1234567890');

    render(<App />);

    expect(await screen.findByText('Mock Reset Password')).toBeInTheDocument();
  });

  it('renders the report route while signed in', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/report');

    render(<App />);

    expect(await screen.findByText('Mock Report')).toBeInTheDocument();
  });

  it('renders Ghost Mode settings as the dedicated privacy route', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/privacy/ghost-mode');

    render(<App />);

    expect(await screen.findByText('Mock Ghost Mode Settings')).toBeInTheDocument();
  });

  it('renders the cruush+ upgrade route while signed in', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/upgrade');

    render(<App />);

    expect(await screen.findByText('Mock Upgrade')).toBeInTheDocument();
  });

  it('renders the fake cruush+ checkout and success routes while signed in', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/checkout/7d39c89e-e816-4684-82e0-b48e3f8127d4');

    const { unmount } = render(<App />);

    expect(await screen.findByText('Mock Checkout')).toBeInTheDocument();

    unmount();
    window.history.replaceState({}, '', '/checkout/success');
    render(<App />);

    expect(await screen.findByText('Mock Checkout Success')).toBeInTheDocument();
  });

  it('does not expose the retired Safety Center route', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/safety');

    render(<App />);

    expect(await screen.findByText('Mock Map')).toBeInTheDocument();
  });

  it('renders the reset password route while onboarding is required', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: null,
      needsOnboarding: true,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/reset-password?token=reset-token-1234567890');

    render(<App />);

    expect(await screen.findByText('Mock Reset Password')).toBeInTheDocument();
  });

  it('shows the code of conduct gate for onboarded verified users who have not accepted it', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Test User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      needsCodeOfConduct: true,
      codeOfConductVersion: '2026-07-07',
      acceptedCodeOfConductVersion: null,
      codeOfConductAcceptedAt: null,
    });

    render(<App />);

    expect(await screen.findByText('Mock Code Gate')).toBeInTheDocument();
    expect(screen.queryByText('Mock Map')).not.toBeInTheDocument();
  });
});
