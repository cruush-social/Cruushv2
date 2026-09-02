import { BrowserRouter, MemoryRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
import { lazy, Suspense, useEffect, useState } from 'react';
import Auth from './components/Auth';
import VerifyEmail from './components/VerifyEmail';
import ResetPassword from './components/ResetPassword';
import AppErrorBoundary from './components/AppErrorBoundary';
import GoogleAnalyticsPageTracker from './components/GoogleAnalyticsPageTracker';
import { Toaster } from './components/ui/sonner';
import { loadCurrentSession } from './lib/sessionUser';
import { canUseDeveloperMapToolsEmail } from './lib/developerMapTools';
import { recordDailyRewardCheckIn, updateRewardTimezone } from './lib/rewardsApi';
import type { AuthSessionPayload } from './lib/authApi';
import type { ProfileRecord } from './lib/profileApi';
import MapControlsTutorial, {
  getStoredMapControlsTutorialStep,
  MAP_CONTROLS_TUTORIAL_STORAGE_KEY,
  notifyMapControlsTutorialCompleted,
  type MapControlsTutorialStepId,
} from './components/MapControlsTutorial';
import { markNoticeDismissed } from './lib/userNoticesApi';
import AccessibilityQuickAccess from './components/AccessibilityQuickAccess';

const MapHome = lazy(() => import('./components/MapHome'));
const LocalFeed = lazy(() => import('./components/LocalFeed'));
const FeedPhotoPreview = lazy(() => import('./components/FeedPhotoPreview'));
const BadgePickerPreview = lazy(() => import('./components/BadgePickerPreview'));
const PulseEffectPreview = lazy(() => import('./components/PulseEffectPreview'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const ProfileEdit = lazy(() => import('./components/ProfileEdit'));
const ProfileOnboarding = lazy(() => import('./components/ProfileOnboarding'));
const AgeVerification = lazy(() => import('./components/AgeVerification'));
const FiltersPanel = lazy(() => import('./components/FiltersPanel'));
const GroupDetail = lazy(() => import('./components/GroupDetail'));
const EventDetail = lazy(() => import('./components/EventDetail'));
const EventPassGuide = lazy(() => import('./components/EventPassGuide'));
const PlaceDetail = lazy(() => import('./components/PlaceDetail'));
const PrivateGroupChat = lazy(() => import('./components/PrivateGroupChat'));
const DirectMessages = lazy(() => import('./components/DirectMessages'));
const NotificationCenter = lazy(() => import('./components/NotificationCenter'));
const NotificationSettings = lazy(() => import('./components/NotificationSettings'));
const ForegroundNotifications = lazy(() => import('./components/ForegroundNotifications'));
const MobileInstallPrompt = lazy(() => import('./components/MobileInstallPrompt'));
const ReportPage = lazy(() => import('./components/ReportPage'));
const ModeratorReview = lazy(() => import('./components/ModeratorReview'));
const CruushActivity = lazy(() => import('./components/CruushActivity'));
const CruushMatchSettings = lazy(() => import('./components/CruushMatchSettings'));
const Settings = lazy(() => import('./components/Settings'));
const BlockedUsersPage = lazy(() => import('./components/BlockedUsersPage'));
const DlModeSettings = lazy(() => import('./components/DlModeSettings'));
const MapPresenceSettings = lazy(() => import('./components/MapPresenceSettings'));
const DlModeDefaultNotice = lazy(() => import('./components/DlModeDefaultNotice'));
const FirstFeedPostPrompt = lazy(() => import('./components/FirstFeedPostPrompt'));
const OnboardingPreview = lazy(() => import('./components/OnboardingPreview'));
const SupportPage = lazy(() => import('./components/SupportPage'));
const GhostModeSettings = lazy(() => import('./components/GhostModeSettings'));
const PrivacyAudit = lazy(() => import('./components/PrivacyAudit'));
const FeelingLucky = lazy(() => import('./components/FeelingLucky'));
const RequestsDashboard = lazy(() => import('./components/RequestsDashboard'));
const CodeOfConductGate = lazy(() => import('./components/CodeOfConductGate'));
const EmailVerificationGate = lazy(() => import('./components/EmailVerificationGate'));
const BottomNav = lazy(() => import('./components/BottomNav'));
const DebugCruushPlusToggle = lazy(() => import('./components/DebugCruushPlusToggle'));
const Rewards = lazy(() => import('./components/Rewards'));
const CruushPlusStore = lazy(() => import('./components/CruushPlusStore'));
const AlphaBugButton = lazy(() => import('./components/AlphaBugButton'));
const TwoFactorSettings = lazy(() => import('./components/TwoFactorSettings'));
const PublicInfoPage = lazy(() => import('./components/PublicInfoPage'));
const Tutorial = lazy(() => import('./components/Tutorial'));
const Changelog = lazy(() => import('./components/Changelog'));
const Survey = lazy(() => import('./components/Survey'));

const PUBLIC_INFO_ROUTES = [
  { path: '/about', page: 'about' },
  { path: '/terms', page: 'terms' },
  { path: '/privacy', page: 'privacy' },
  { path: '/safety', page: 'safety' },
  { path: '/security', page: 'security' },
  { path: '/billing-policy', page: 'billing' },
  { path: '/content-removal', page: 'content-removal' },
  { path: '/human-trafficking-policy', page: 'human-trafficking' },
  { path: '/takedown-policy', page: 'takedown' },
  { path: '/2257', page: '2257' },
] as const;

function renderPublicRoutes(includeSupport = false) {
  return [
    ...PUBLIC_INFO_ROUTES.map((route) => (
      <Route key={route.path} path={route.path} element={<PublicInfoPage page={route.page} />} />
    )),
    <Route key="/survey" path="/survey" element={<Survey />} />,
    ...(includeSupport
      ? [<Route key="/support" path="/support" element={<SupportPage publicAccess />} />]
      : []),
  ];
}

function redirectToMap() {
  window.history.replaceState({}, '', '/map');
}

function redirectToRewards() {
  window.history.replaceState({}, '', '/rewards');
}

function getInitialAppRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getInitialAppEntries(initialRoute = getInitialAppRoute()) {
  const url = new URL(initialRoute, 'https://cruush.app');
  const { pathname } = url;
  let fallback: string | null = null;

  const eventPassGuideMatch = pathname.match(/^\/events\/([^/]+)\/pass-guide\/?$/);

  if (eventPassGuideMatch) {
    fallback = `/events/${eventPassGuideMatch[1]}`;
  } else if (pathname.startsWith('/chat/')) {
    fallback = '/messages';
  } else if (pathname === '/profile/edit') {
    fallback = '/profile';
  } else if (pathname === '/cruush/settings') {
    fallback = '/cruush';
  } else if (
    pathname.startsWith('/settings/')
    || pathname.startsWith('/privacy/')
    || pathname === '/support'
    || pathname === '/requests'
  ) {
    fallback = '/settings';
  } else if (pathname !== '/' && pathname !== '/map') {
    fallback = '/map';
  }

  return fallback ? [fallback, initialRoute] : [initialRoute];
}

function CanonicalAppAddressBar() {
  useEffect(() => {
    if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state ?? {}, '', '/');
    }
  }, []);

  return null;
}

function RouteLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  );
}

function mapTutorialRoute(step: MapControlsTutorialStepId) {
  if (step === 'ghost') {
    return '/privacy/ghost-mode';
  }

  if (step === 'feed') {
    return '/feed';
  }

  if (step === 'carousel') {
    return '/lucky';
  }

  return '/map';
}

function MapTutorialRouteFollower() {
  const location = useLocation();
  const navigate = useNavigate();
  const savedStep = getStoredMapControlsTutorialStep();

  if (!savedStep || location.pathname === '/map') {
    return null;
  }

  const followStep = (step: MapControlsTutorialStepId) => {
    const destination = mapTutorialRoute(step);

    if (location.pathname !== destination) {
      navigate(destination);
    }
  };

  const completeTutorial = () => {
    markNoticeDismissed(MAP_CONTROLS_TUTORIAL_STORAGE_KEY);
    notifyMapControlsTutorialCompleted();
  };

  return (
    <MapControlsTutorial
      open
      onActivateStep={followStep}
      onComplete={completeTutorial}
      onStepChange={followStep}
    />
  );
}

function getTokenLinkType() {
  const searchParams = new URLSearchParams(window.location.search);

  if (searchParams.has('verifyEmailToken')) {
    return 'verify-email';
  }

  if (searchParams.has('resetPasswordToken')) {
    return 'reset-password';
  }

  return null;
}

type AppProps = {
  humanModerationEnabled?: boolean;
};

export function useAuthShellControlsScrolled(enabled: boolean) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') {
      setScrolled(false);
      return;
    }

    const sync = (shell: HTMLElement) => {
      const nextScrolled = shell.scrollTop > 8;
      setScrolled((currentScrolled) => currentScrolled === nextScrolled ? currentScrolled : nextScrolled);
    };
    const handleScroll = (event: Event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains('launch-login-auth-shell')) {
        sync(event.target);
      }
    };
    const shell = document.querySelector<HTMLElement>('.launch-login-auth-shell');

    if (shell) {
      sync(shell);
    }
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [enabled]);

  return scrolled;
}

export default function App({
  humanModerationEnabled = true,
}: AppProps = {}) {
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed_out' | 'signed_in'>('loading');
  const [session, setSession] = useState<AuthSessionPayload | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const authShellControlsScrolled = useAuthShellControlsScrolled(authStatus === 'signed_out');

  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      try {
        const session = await loadCurrentSession();

        if (!isActive) {
          return;
        }

        if (!session) {
          setSession(null);
          setNeedsOnboarding(false);
          setAuthStatus('signed_out');
          return;
        }

        setSession(session);
        setNeedsOnboarding(session.needsOnboarding);
        setAuthStatus('signed_in');
      } catch {
        if (!isActive) {
          return;
        }

        setNeedsOnboarding(false);
        setAuthStatus('signed_out');
      }
    };

    void bootstrap();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'signed_in' || !session?.user.emailVerifiedAt) {
      return;
    }

    let isActive = true;
    const checkIn = async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await updateRewardTimezone(timezone).catch(() => undefined);

      if (isActive) {
        await recordDailyRewardCheckIn().catch(() => undefined);
      }
    };

    void checkIn();
    return () => {
      isActive = false;
    };
  }, [authStatus, session?.user.emailVerifiedAt, session?.user.id]);

  const handleAuth = (session: AuthSessionPayload) => {
    setSession(session);
    if (session.user.emailVerifiedAt) {
      redirectToMap();
    }
    setNeedsOnboarding(session.needsOnboarding);
    setAuthStatus('signed_in');
  };

  const handleVerified = (nextSession: AuthSessionPayload) => {
    setSession(nextSession);
    setNeedsOnboarding(nextSession.needsOnboarding);
    redirectToMap();
    setAuthStatus('signed_in');
  };

  const handleSignedOut = () => {
    setSession(null);
    setNeedsOnboarding(false);
    setAuthStatus('signed_out');
  };

  const handleOnboardingComplete = (nextSession?: AuthSessionPayload, destination: 'map' | 'rewards' = 'map') => {
    if (nextSession) {
      setSession(nextSession);
      setNeedsOnboarding(nextSession.needsOnboarding);
    } else {
      setNeedsOnboarding(false);
    }
    if (destination === 'rewards') {
      redirectToRewards();
    } else {
      redirectToMap();
    }
  };

  const handleAgeVerified = (nextSession: AuthSessionPayload) => {
    setSession(nextSession);
    setNeedsOnboarding(nextSession.needsOnboarding);
  };

  const handleCodeOfConductAccepted = (nextSession: AuthSessionPayload) => {
    setSession(nextSession);
    setNeedsOnboarding(nextSession.needsOnboarding);
  };

  const handleProfileSaved = (savedProfile: ProfileRecord) => {
    setSession((currentSession) => currentSession ? {
      ...currentSession,
      user: {
        ...currentSession.user,
        displayName: savedProfile.display_name,
      },
      profile: {
        displayName: savedProfile.display_name,
        yearOfBirth: savedProfile.year_of_birth,
      },
    } : currentSession);
  };

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading session...</div>
      </div>
    );
  }

  const tokenLinkType = getTokenLinkType();
  const alphaBugControl = (
    <AlphaBugButton
      enabled
      requireContactEmail={authStatus === 'signed_out'}
    />
  );
  const accessibilityQuickAccess = <AccessibilityQuickAccess authShellScrolled={authShellControlsScrolled} />;

  if (tokenLinkType === 'verify-email') {
    return (
      <BrowserRouter key="root-verification-router">
        <GoogleAnalyticsPageTracker />
        <Routes>
          <Route path="*" element={<VerifyEmail />} />
        </Routes>
        <Suspense fallback={null}>
          {alphaBugControl}
        </Suspense>
        {accessibilityQuickAccess}
      </BrowserRouter>
    );
  }

  if (tokenLinkType === 'reset-password') {
    return (
      <BrowserRouter key="root-reset-router">
        <GoogleAnalyticsPageTracker />
        <Routes>
          <Route path="*" element={<ResetPassword />} />
        </Routes>
        <Suspense fallback={null}>
          {alphaBugControl}
        </Suspense>
        {accessibilityQuickAccess}
      </BrowserRouter>
    );
  }

  if (authStatus === 'signed_out') {
    return (
      <BrowserRouter key="public-router">
        <GoogleAnalyticsPageTracker />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {renderPublicRoutes(true)}
            <Route path="*" element={<Auth onAuth={handleAuth} />} />
          </Routes>
          {alphaBugControl}
          {accessibilityQuickAccess}
        </Suspense>
      </BrowserRouter>
    );
  }

  if (!session?.user.emailVerifiedAt) {
    return (
      <BrowserRouter key="verification-router">
        <GoogleAnalyticsPageTracker />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {renderPublicRoutes(true)}
            <Route
              path="*"
              element={(
                <EmailVerificationGate
                  email={session?.user.email ?? ''}
                  onSignedOut={handleSignedOut}
                  onVerified={handleVerified}
                />
              )}
            />
          </Routes>
          {alphaBugControl}
          {accessibilityQuickAccess}
        </Suspense>
      </BrowserRouter>
    );
  }

  if (session?.needsAgeVerification) {
    return (
      <BrowserRouter key="age-verification-router">
        <GoogleAnalyticsPageTracker />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {renderPublicRoutes(true)}
            <Route path="*" element={<AgeVerification onVerified={handleAgeVerified} />} />
          </Routes>
          {alphaBugControl}
          {accessibilityQuickAccess}
        </Suspense>
      </BrowserRouter>
    );
  }

  if (needsOnboarding) {
    return (
      <BrowserRouter key="onboarding-router">
        <GoogleAnalyticsPageTracker />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {renderPublicRoutes(true)}
            <Route
              path="*"
              element={(
                <ProfileOnboarding
                  onComplete={handleOnboardingComplete}
                  needsCodeOfConduct={Boolean(session?.needsCodeOfConduct)}
                  codeOfConductVersion={session?.codeOfConductVersion ?? ''}
                />
              )}
            />
          </Routes>
          {alphaBugControl}
          {accessibilityQuickAccess}
        </Suspense>
      </BrowserRouter>
    );
  }

  if (session?.needsCodeOfConduct) {
    return (
      <BrowserRouter key="code-of-conduct-router">
        <GoogleAnalyticsPageTracker />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {renderPublicRoutes(true)}
            <Route
              path="*"
              element={(
                <CodeOfConductGate
                  version={session.codeOfConductVersion}
                  onAccepted={handleCodeOfConductAccepted}
                />
              )}
            />
          </Routes>
          {alphaBugControl}
          {accessibilityQuickAccess}
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <MemoryRouter key="app-router" initialEntries={getInitialAppEntries()}>
      <CanonicalAppAddressBar />
      <GoogleAnalyticsPageTracker />
      <AppErrorBoundary>
        <div className="min-h-screen bg-background text-foreground">
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/map" replace />} />
              <Route path="/map" element={<MapHome developerToolsEnabled={canUseDeveloperMapToolsEmail(session?.user.email)} />} />
              <Route path="/feed" element={<LocalFeed />} />
              <Route path="/feed/photo-preview" element={<FeedPhotoPreview />} />
              <Route path="/settings/badges" element={<BadgePickerPreview />} />
              <Route path="/settings/pulse-effects" element={<PulseEffectPreview />} />
              <Route path="/profile" element={<ProfileView />} />
              <Route path="/profile/:userId" element={<ProfileView />} />
              <Route path="/profile/edit" element={<ProfileEdit onSaved={handleProfileSaved} />} />
              <Route path="/filters" element={<FiltersPanel />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {renderPublicRoutes()}
              <Route path="/groups/:groupId" element={<GroupDetail />} />
              <Route path="/events/:eventId/pass-guide" element={<EventPassGuide />} />
              <Route path="/events/:eventId" element={<EventDetail />} />
              <Route path="/places/:placeId" element={<PlaceDetail />} />
              <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
              <Route path="/chat/group/:chatId" element={<PrivateGroupChat />} />
              <Route path="/messages" element={<DirectMessages />} />
              <Route path="/notifications" element={<NotificationCenter />} />
              <Route path="/report" element={<ReportPage />} />
              {humanModerationEnabled ? (
                <Route path="/admin/moderation" element={<ModeratorReview />} />
              ) : null}
              <Route path="/cruush" element={<CruushActivity />} />
              <Route path="/cruush/settings" element={<CruushMatchSettings />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/blocked-users" element={<BlockedUsersPage />} />
              <Route path="/settings/notifications" element={<NotificationSettings />} />
              <Route path="/settings/2fa" element={<TwoFactorSettings />} />
              <Route path="/settings/tutorial" element={<Tutorial />} />
              <Route path="/settings/changelog" element={<Changelog />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
              <Route path="/privacy/dl-mode" element={<DlModeSettings />} />
              <Route path="/privacy/map-presence" element={<MapPresenceSettings />} />
              <Route path="/privacy/audit" element={<PrivacyAudit />} />
              {import.meta.env.DEV ? (
                <Route path="/dev/onboarding-preview" element={<OnboardingPreview />} />
              ) : null}
              <Route path="/lucky" element={<FeelingLucky />} />
              <Route path="/requests" element={<RequestsDashboard />} />
              <Route path="/store" element={<CruushPlusStore />} />
              <Route path="/upgrade" element={<Navigate to="/rewards" replace />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/checkout/success" element={<Navigate to="/rewards" replace />} />
              <Route path="/checkout/:sessionId" element={<Navigate to="/rewards" replace />} />
              <Route path="*" element={<Navigate to="/map" replace />} />
            </Routes>
            <MapTutorialRouteFollower />
            <MobileInstallPrompt />
            <DlModeDefaultNotice />
            <FirstFeedPostPrompt userId={session.user.id} />
            <BottomNav />
            <ForegroundNotifications />
            <DebugCruushPlusToggle />
            {alphaBugControl}
          </Suspense>
          <Toaster closeButton position="top-center" richColors />
        </div>
      </AppErrorBoundary>
    </MemoryRouter>
  );
}
