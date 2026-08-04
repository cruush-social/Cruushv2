import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const { loadCurrentSession, persistSessionUser, routeModuleLoads } = vi.hoisted(() => ({
  loadCurrentSession: vi.fn(),
  persistSessionUser: vi.fn(),
  routeModuleLoads: [] as string[],
}));

vi.mock('./lib/sessionUser', () => ({
  loadCurrentSession,
  persistSessionUser,
}));

vi.mock('./components/MapHome', () => {
  routeModuleLoads.push('MapHome');
  return {
    default: () => <div>Mock Map</div>,
    canUseDeveloperMapToolsEmail: () => false,
    isDevelopmentAdminEmail: () => false,
  };
});

vi.mock('./components/LocalFeed', () => {
  routeModuleLoads.push('LocalFeed');
  return {
    default: () => <div>Mock Feed</div>
  };
});

vi.mock('./components/ProfileView', () => {
  routeModuleLoads.push('ProfileView');
  return {
    default: () => <div>Mock Profile</div>
  };
});

vi.mock('./components/ProfileEdit', () => {
  routeModuleLoads.push('ProfileEdit');
  return {
    default: () => <div>Mock Profile Edit</div>
  };
});

vi.mock('./components/ProfileOnboarding', () => ({
  default: ({
    onComplete,
  }: {
    onComplete: (session?: unknown, destination?: 'map' | 'rewards') => void;
  }) => (
    <div>
      <div>Mock Onboarding</div>
      <button type="button" onClick={() => onComplete(undefined, 'rewards')}>
        Complete onboarding to rewards
      </button>
      <button type="button" onClick={() => onComplete(undefined, 'map')}>
        Complete onboarding to map
      </button>
    </div>
  ),
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

vi.mock('./components/ModeratorReview', () => ({
  default: () => <div>Mock Moderator Review</div>
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

vi.mock('./components/DlModeSettings', () => ({
  default: () => <div>Mock DL Mode Settings</div>
}));

vi.mock('./components/DlModeDefaultNotice', () => ({
  default: () => <div data-testid="mock-dl-mode-default-notice" />
}));

vi.mock('./components/BetaLaunchCruushPlusOffer', () => ({
  default: () => <div data-testid="mock-beta-launch-plus-offer" />
}));

vi.mock('./components/FeelingLucky', () => ({
  default: () => <div>Mock Lucky</div>
}));

vi.mock('./components/Rewards', () => ({
  default: () => <div>Mock Rewards</div>
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

vi.mock('./components/AlphaBugButton', () => ({
  default: ({ enabled }: { enabled?: boolean }) => (enabled ? <button type="button">Mock Alpha Bug</button> : null)
}));

vi.mock('./components/PublicInfoPage', () => ({
  default: ({ page }: { page: string }) => <div>Mock Public Info {page}</div>
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
  const activeAlphaTest = {
    alphaTest: {
      enabled: true,
      active: true,
      endsAt: '2026-08-01T03:59:00.000Z',
      ended: false,
    },
  };

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    loadCurrentSession.mockReset();
    persistSessionUser.mockReset();
  });

  it('does not load signed-in route modules before signed-out users authenticate', async () => {
    loadCurrentSession.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Mock Auth' })).toBeInTheDocument();
    expect(routeModuleLoads).not.toEqual(expect.arrayContaining([
      'MapHome',
      'LocalFeed',
      'ProfileView',
      'ProfileEdit',
    ]));
  });

  it('renders public info pages before authentication', async () => {
    window.history.replaceState({}, '', '/about');
    loadCurrentSession.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByText('Mock Public Info about')).toBeInTheDocument();
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

  it('does not show the alpha bug button for signed-in users outside active alpha testing', async () => {
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
    expect(screen.queryByRole('button', { name: 'Mock Alpha Bug' })).not.toBeInTheDocument();
  });

  it('shows the alpha bug button on authenticated app routes for active alpha testers', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'alpha@example.com',
        displayName: 'Alpha User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Alpha User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
      ...activeAlphaTest,
    });
    window.history.replaceState({}, '', '/settings');

    render(<App />);

    expect(await screen.findByText('Mock Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mock Alpha Bug' })).toBeInTheDocument();
  });

  it('keeps the alpha bug button on token-link routes for active alpha testers', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'alpha@example.com',
        displayName: 'Alpha User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Alpha User',
        yearOfBirth: 1998,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
      ...activeAlphaTest,
    });
    window.history.replaceState({}, '', '/?resetPasswordToken=reset-token-1234567890');

    render(<App />);

    expect(await screen.findByText('Mock Reset Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mock Alpha Bug' })).toBeInTheDocument();
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

  it('renders the protected moderator route without a client feature flag', async () => {
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'moderator@example.com',
        displayName: 'Moderator',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Moderator',
        yearOfBirth: 1990,
      },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/admin/moderation');

    render(<App />);

    expect(await screen.findByText('Mock Moderator Review')).toBeInTheDocument();
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

  it('renders DL Mode settings as the dedicated privacy route', async () => {
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
    window.history.replaceState({}, '', '/privacy/dl-mode');

    render(<App />);

    expect(await screen.findByText('Mock DL Mode Settings')).toBeInTheDocument();
  });

  it('redirects the cruush+ upgrade route to rewards while signed in', async () => {
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

    expect(await screen.findByText('Mock Rewards')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/rewards');
  });

  it('redirects fake cruush+ checkout routes to rewards while signed in', async () => {
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

    expect(await screen.findByText('Mock Rewards')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/rewards');

    unmount();
    window.history.replaceState({}, '', '/checkout/success');
    render(<App />);

    expect(await screen.findByText('Mock Rewards')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/rewards');
  });

  it('renders the public safety page for signed-in users', async () => {
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

    expect(await screen.findByText('Mock Public Info safety')).toBeInTheDocument();
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

  it('opens rewards after onboarding asks for the 2FA handoff', async () => {
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

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Complete onboarding to rewards' }));

    expect(await screen.findByText('Mock Rewards')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/rewards');
  });

  it('returns to the map after onboarding without a post-login affiliate prompt', async () => {
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

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Complete onboarding to map' }));

    expect(await screen.findByText('Mock Map')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /share your affiliate link/i })).not.toBeInTheDocument();
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
