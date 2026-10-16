import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavigate } from 'react-router';
import App, { getInitialAppEntries } from './App';

// AppViewport resets the scroll position of its own content element on every
// route change. This jsdom build ships no Element.prototype.scrollTo, so that
// layout effect threw, the app shell error boundary replaced the whole tree,
// and every authenticated route test failed on a missing mock route element.
// src/test/setup.ts stubs scrollIntoView the same way for the same reason.
Element.prototype.scrollTo ??= function scrollTo() {};

const { getRewardSummary, getSideQuests, loadCurrentSession, persistSessionUser, recordDailyRewardCheckIn, refreshExistingPushSubscription, routeModuleLoads, updateRewardTimezone } = vi.hoisted(() => ({
  getRewardSummary: vi.fn(),
  // The Side Quest prompt mounts inside the authenticated shell and reads this
  // on every route. Leaving it off the mock threw during the first effect and
  // the error boundary replaced the whole tree, which failed every route test
  // at once for a reason that had nothing to do with routing.
  getSideQuests: vi.fn(),
  loadCurrentSession: vi.fn(),
  persistSessionUser: vi.fn(),
  recordDailyRewardCheckIn: vi.fn(),
  refreshExistingPushSubscription: vi.fn(),
  updateRewardTimezone: vi.fn(),
  routeModuleLoads: [] as string[],
}));

vi.mock('./lib/pushNotifications', () => ({ refreshExistingPushSubscription }));

vi.mock('./lib/sessionUser', () => ({
  loadCurrentSession,
  persistSessionUser,
}));

vi.mock('./lib/rewardsApi', () => ({
  getRewardSummary,
  getSideQuests,
  recordDailyRewardCheckIn,
  updateRewardTimezone,
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
    default: () => {
      const navigate = useNavigate();

      return (
        <div>
          Mock Feed
          <button type="button" onClick={() => navigate('/settings')}>Open settings from feed</button>
        </div>
      );
    }
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

vi.mock('./components/ForegroundNotifications', () => ({
  default: () => null
}));

vi.mock('./components/FirstFeedPostPrompt', () => ({
  default: () => null
}));

vi.mock('./components/OnboardingPreview', () => ({
  default: () => <div>Mock Onboarding Preview</div>
}));

vi.mock('./components/MobileInstallPrompt', () => ({
  default: ({ userId }: { userId: string }) => <div data-testid="mock-mobile-install-prompt">{userId}</div>
}));

vi.mock('./components/PushPermissionPrompt', () => ({
  default: ({ userId }: { userId: string }) => <div data-testid="mock-push-permission-prompt">{userId}</div>
}));

vi.mock('./components/FiltersPanel', () => ({
  default: () => <div>Mock Filters</div>
}));

vi.mock('./components/GroupDetail', () => ({
  default: () => <div>Mock Group</div>
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
  default: () => <div>Mock cruush</div>
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
    <div className="launch-login-auth-shell">
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
    </div>
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
  default: () => {
    const navigate = useNavigate();

    return (
      <div>
        Mock Settings
        <button type="button" onClick={() => navigate(-1)}>Back from settings</button>
      </div>
    );
  }
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

vi.mock('./components/FeelingLucky', () => ({
  default: () => <div>Mock Lucky</div>
}));

vi.mock('./components/Rewards', () => ({
  default: () => <div>Mock Rewards</div>
}));

vi.mock('./components/CruushPlusStore', () => ({
  default: () => <div>Mock cruush+ checkout</div>
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
  default: ({ authShellScrolled, enabled }: { authShellScrolled?: boolean; enabled?: boolean }) => (
    enabled
      ? <button aria-label="Mock Alpha Bug" data-auth-shell-scrolled={String(Boolean(authShellScrolled))} type="button">Mock Alpha Bug</button>
      : null
  )
}));

vi.mock('./components/PublicInfoPage', () => ({
  default: ({ page }: { page: string }) => <div>Mock Public Info {page}</div>
}));

vi.mock('./components/Survey', () => ({
  default: () => <div>Mock Survey</div>
}));

vi.mock('./components/SupportPage', () => ({
  default: ({ appealOnly }: { appealOnly?: boolean; publicAccess?: boolean }) => {
    const appealMode = appealOnly || new URLSearchParams(window.location.search).get('appeal') === '1';
    return <div>{appealMode ? 'Mock Age Suspension Appeal' : 'Mock Support'}</div>;
  },
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
    getRewardSummary.mockReset().mockResolvedValue({ recentGrants: [] });
    getSideQuests.mockReset().mockResolvedValue({ quests: [], claimingAvailable: false });
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    loadCurrentSession.mockReset();
    persistSessionUser.mockReset();
    recordDailyRewardCheckIn.mockReset();
    recordDailyRewardCheckIn.mockResolvedValue({ credited: false, grants: [] });
    updateRewardTimezone.mockReset();
    updateRewardTimezone.mockResolvedValue({ timezone: 'America/New_York' });
    refreshExistingPushSubscription.mockReset();
    refreshExistingPushSubscription.mockResolvedValue(undefined);
  });

  it('seeds direct authenticated routes with their expected Back destination', () => {
    expect(getInitialAppEntries('/settings/notifications')).toEqual(['/settings', '/settings/notifications']);
    expect(getInitialAppEntries('/privacy/ghost-mode')).toEqual(['/settings', '/privacy/ghost-mode']);
    expect(getInitialAppEntries('/chat/group/thread-1')).toEqual(['/messages', '/chat/group/thread-1']);
    expect(getInitialAppEntries('/events/event-1/pass-guide')).toEqual(['/events/event-1', '/events/event-1/pass-guide']);
    expect(getInitialAppEntries('/feed?view=nearby#latest')).toEqual(['/map', '/feed?view=nearby#latest']);
    expect(getInitialAppEntries('/map')).toEqual(['/map']);
    expect(getInitialAppEntries('/')).toEqual(['/map']);
    expect(getInitialAppEntries('/?unused=1#latest')).toEqual(['/map']);
  });

  it('makes Back work after a direct authenticated page load', async () => {
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
    window.history.replaceState({}, '', '/settings');

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Back from settings' }));
    expect(await screen.findByText('Mock Map')).toBeInTheDocument();
  });

  it('uses real in-app history before a direct-route fallback', async () => {
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
    window.history.replaceState({}, '', '/feed');

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open settings from feed' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back from settings' }));
    expect(await screen.findByText('Mock Feed')).toBeInTheDocument();
  });

  it('does not load signed-in route modules before signed-out users authenticate', async () => {
    loadCurrentSession.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Mock Auth' })).toBeInTheDocument();
    expect(screen.queryByTestId('mock-mobile-install-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-push-permission-prompt')).not.toBeInTheDocument();
    expect(routeModuleLoads).not.toEqual(expect.arrayContaining([
      'MapHome',
      'LocalFeed',
      'ProfileView',
      'ProfileEdit',
    ]));
    expect(recordDailyRewardCheckIn).not.toHaveBeenCalled();
  });

  it('keeps the bug button present while the signed-out accessibility control clears the scrolled form', async () => {
    loadCurrentSession.mockResolvedValue(null);

    const { container } = render(<App />);
    const shell = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.launch-login-auth-shell');
      expect(element).not.toBeNull();
      return element!;
    });

    shell.scrollTop = 24;
    fireEvent.scroll(shell);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Mock Alpha Bug' })).toHaveAttribute('data-auth-shell-scrolled', 'false'));
    expect(screen.getByTestId('accessibility-quick-access')).toHaveClass('-translate-y-24', 'opacity-0');

    shell.scrollTop = 0;
    fireEvent.scroll(shell);

    expect(screen.getByRole('button', { name: 'Mock Alpha Bug' })).toBeInTheDocument();
  });

  it('renders public info pages before authentication', async () => {
    window.history.replaceState({}, '', '/about');
    loadCurrentSession.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByText('Mock Public Info about')).toBeInTheDocument();
  });

  it('requires sign in for the survey and returns directly to it after authentication', async () => {
    window.history.replaceState({}, '', '/survey');
    loadCurrentSession.mockResolvedValue(null);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mock Auth' }));

    expect(await screen.findByText('Mock Survey')).toBeInTheDocument();
    expect(screen.getByText('Mock Map')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-dock-right')).toContainElement(screen.getByText('Mock Survey'));
  });

  it('renders the age suspension appeal before authentication', async () => {
    window.history.replaceState({}, '', '/support?appeal=1');
    loadCurrentSession.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByText('Mock Age Suspension Appeal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mock Auth' })).not.toBeInTheDocument();
  });

  it('renders general support before authentication', async () => {
    window.history.replaceState({}, '', '/support');
    loadCurrentSession.mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByText('Mock Support')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mock Auth' })).not.toBeInTheDocument();
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
    expect(screen.getByTestId('mock-mobile-install-prompt')).toHaveTextContent('user-1');
    expect(screen.getByTestId('mock-push-permission-prompt')).toHaveTextContent('user-1');
    expect(screen.getByTestId('mock-dl-mode-default-notice')).toBeInTheDocument();
  });

  it('retries failed push registration when the signed-in app reconnects or returns to the foreground', async () => {
    loadCurrentSession.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', displayName: 'Test User', emailVerifiedAt: '2026-04-28T12:00:00.000Z', createdAt: '2026-04-28T12:00:00.000Z' },
      profile: { displayName: 'Test User', yearOfBirth: 1998 },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    refreshExistingPushSubscription.mockRejectedValueOnce(new Error('Offline'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { unmount } = render(<App />);
    await screen.findByText('Mock Map');
    await waitFor(() => expect(refreshExistingPushSubscription).toHaveBeenCalledTimes(1));

    fireEvent(window, new Event('online'));
    await waitFor(() => expect(refreshExistingPushSubscription).toHaveBeenCalledTimes(2));
    visibility.mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(refreshExistingPushSubscription).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(refreshExistingPushSubscription).toHaveBeenCalledTimes(3));

    let finishRefresh!: () => void;
    refreshExistingPushSubscription.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(refreshExistingPushSubscription).toHaveBeenCalledTimes(4);
    const activeSignal = refreshExistingPushSubscription.mock.calls.at(-1)?.[0] as AbortSignal;
    expect(activeSignal.aborted).toBe(false);
    unmount();
    expect(activeSignal.aborted).toBe(true);
    finishRefresh();
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    expect(refreshExistingPushSubscription).toHaveBeenCalledTimes(4);
    visibility.mockRestore();
  });

  it('does not register push on reconnect while signed out', async () => {
    loadCurrentSession.mockResolvedValue(null);
    render(<App />);
    await screen.findByRole('button', { name: 'Mock Auth' });
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    expect(refreshExistingPushSubscription).not.toHaveBeenCalled();
  });

  it('records one daily reward check-in after a verified session loads', async () => {
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
    await waitFor(() => expect(recordDailyRewardCheckIn).toHaveBeenCalledTimes(1));
    expect(updateRewardTimezone).toHaveBeenCalledTimes(1);
    expect(updateRewardTimezone.mock.invocationCallOrder[0]).toBeLessThan(
      recordDailyRewardCheckIn.mock.invocationCallOrder[0],
    );
  });

  it('shows the bug button for signed-in users outside active alpha testing', async () => {
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
    expect(screen.getByRole('button', { name: 'Mock Alpha Bug' })).toBeInTheDocument();
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

  it('renders signed-in profile deep links without exposing the profile id in the browser URL', async () => {
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
    window.history.replaceState({}, '', '/profile/other-user-123');

    render(<App />);

    expect(await screen.findByText('Mock Profile')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('renders signed-in chat deep links without exposing the chat id in the browser URL', async () => {
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
    window.history.replaceState({}, '', '/chat/96bab72b-48db-4aee-9f85-e37face83625');

    render(<App />);

    expect(await screen.findByText('Mock Group Chat')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('renders a signed-in Club detail link with share and join-request actions', async () => {
    const clubId = '22222222-2222-4222-8222-222222222222';
    loadCurrentSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerifiedAt: '2026-04-28T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: { displayName: 'Test User', yearOfBirth: 1998 },
      needsOnboarding: false,
      ...acceptedConductSession,
    });
    window.history.replaceState({}, '', `/clubs/${clubId}`);
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/clubs/${clubId}` && (!init?.method || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({
            data: {
              id: clubId,
              title: 'Brooklyn techno',
              summary: 'A Club for local dancers.',
              tags: ['leather', 'techno'],
              joinRequestStatus: 'none',
            },
          }),
        };
      }
      if (url === `/api/clubs/${clubId}/join-requests` && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify({ data: { joinRequestStatus: 'pending' } }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(<App />);

      expect(await screen.findByRole('heading', { name: 'Brooklyn techno' }, { timeout: 10_000 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Share Coven' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Request to join' }));
      expect(await screen.findByRole('button', { name: 'Request sent' })).toBeDisabled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not render the alpha bug button on token-link routes', async () => {
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
    expect(screen.queryByRole('button', { name: 'Mock Alpha Bug' })).not.toBeInTheDocument();
  });

  it('renders the map after login without changing the browser URL', async () => {
    loadCurrentSession.mockResolvedValue(null);
    window.history.replaceState({}, '', '/feed');

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mock Auth' }));

    expect(await screen.findByText('Mock Map')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
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

  it.each([
    ['julienlenazny@gmail.com', 'admin', true],
    ['other@example.com', 'admin', false],
    ['julienlenazny@gmail.com', 'moderator', false],
  ])('gates onboarding replay for %s with role %s', async (email, moderatorRole, allowed) => {
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = vi.fn();
    loadCurrentSession.mockResolvedValue({
      user: { id: 'user-1', email, moderatorRole, displayName: 'Test', emailVerifiedAt: '2026-09-08', createdAt: '2026-09-08' },
      profile: { displayName: 'Test', yearOfBirth: 1990 }, needsOnboarding: false, ...acceptedConductSession,
    });
    window.history.replaceState({}, '', '/settings/onboarding-test');
    try {
      render(<App />);
      // The replay is the new-member onboarding screen itself, outside the
      // signed-in shell, so no bottom navigation surrounds it. Only the admin
      // close bar is added.
      expect(await screen.findByText(allowed ? 'Mock Onboarding' : 'Mock Settings')).toBeInTheDocument();
      if (allowed) {
        expect(screen.queryByText('Mock Bottom Nav')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close onboarding test' })).toBeInTheDocument();
      } else {
        expect(screen.queryByText('Mock Onboarding')).not.toBeInTheDocument();
      }
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
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

  it('redirects the cruush+ upgrade route to checkout while signed in', async () => {
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

    expect(await screen.findByText('Mock cruush+ checkout')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
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
    expect(window.location.pathname).toBe('/');

    unmount();
    window.history.replaceState({}, '', '/checkout/success');
    render(<App />);

    expect(await screen.findByText('Mock Rewards')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
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
    expect(window.location.pathname).toBe('/');
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
