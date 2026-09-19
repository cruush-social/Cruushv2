import { BrowserRouter, MemoryRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
import { Suspense, useEffect, useState } from 'react';
import { lazyRoute } from './lib/lazyRoute';
import { useSyncDistancePreferences } from './lib/distancePreferences';
import Auth from './components/Auth';
import VerifyEmail from './components/VerifyEmail';
import ConfirmEmailChange from './components/ConfirmEmailChange';
import ResetPassword from './components/ResetPassword';
import AppErrorBoundary from './components/AppErrorBoundary';
import AppViewport from './components/AppViewport';
import BottomNav from './components/BottomNav';
import GoogleAnalyticsPageTracker from './components/GoogleAnalyticsPageTracker';
import { Toaster } from './components/ui/sonner';
import { loadCurrentSession } from './lib/sessionUser';
import { canUseDeveloperMapToolsEmail } from './lib/developerMapTools';
import { canTestOnboarding } from './lib/adminOnboarding';
import { recordDailyRewardCheckIn, recordTutorialCompletion, updateRewardTimezone } from './lib/rewardsApi';
import type { AuthSessionPayload } from './lib/authApi';
import { refreshExistingPushSubscription } from './lib/pushNotifications';
import type { ProfileRecord } from './lib/profileApi';
import MapControlsTutorial, {
  getStoredMapControlsTutorialStep,
  MAP_CONTROLS_TUTORIAL_STORAGE_KEY,
  notifyMapControlsTutorialCompleted,
  type MapControlsTutorialStepId,
} from './components/MapControlsTutorial';
import { markNoticeDismissed } from './lib/userNoticesApi';
import AccessibilityQuickAccess from './components/AccessibilityQuickAccess';
import LoadingCardSkeletons from './components/LoadingCardSkeletons';

const MapHome = lazyRoute(() => import('./components/MapHome'));
const LocalFeed = lazyRoute(() => import('./components/LocalFeed'));
const FeedPhotoPreview = lazyRoute(() => import('./components/FeedPhotoPreview'));
const BadgePickerPreview = lazyRoute(() => import('./components/BadgePickerPreview'));
const PulseEffectPreview = lazyRoute(() => import('./components/PulseEffectPreview'));
const ProfileView = lazyRoute(() => import('./components/ProfileView'));
const ProfileEdit = lazyRoute(() => import('./components/ProfileEdit'));
const ProfileOnboarding = lazyRoute(() => import('./components/ProfileOnboarding'));
const AgeVerification = lazyRoute(() => import('./components/AgeVerification'));
const FiltersPanel = lazyRoute(() => import('./components/FiltersPanel'));
const GroupDetail = lazyRoute(() => import('./components/GroupDetail'));
const EventPassGuide = lazyRoute(() => import('./components/EventPassGuide'));
const PlaceDetail = lazyRoute(() => import('./components/PlaceDetail'));
const PrivateGroupChat = lazyRoute(() => import('./components/PrivateGroupChat'));
const DirectMessages = lazyRoute(() => import('./components/DirectMessages'));
const NotificationCenter = lazyRoute(() => import('./components/NotificationCenter'));
const NotificationSettings = lazyRoute(() => import('./components/NotificationSettings'));
const ForegroundNotifications = lazyRoute(() => import('./components/ForegroundNotifications'));
const MobileInstallPrompt = lazyRoute(() => import('./components/MobileInstallPrompt'));
const ReportPage = lazyRoute(() => import('./components/ReportPage'));
const ModeratorReview = lazyRoute(() => import('./components/ModeratorReview'));
const CruushActivity = lazyRoute(() => import('./components/CruushActivity'));
const CruushMatchSettings = lazyRoute(() => import('./components/CruushMatchSettings'));
const Settings = lazyRoute(() => import('./components/Settings'));
const BlockedUsersPage = lazyRoute(() => import('./components/BlockedUsersPage'));
const DlModeSettings = lazyRoute(() => import('./components/DlModeSettings'));
const HankyPreview = lazyRoute(() => import('./components/HankyPreview'));
const KelpieMarkPreview = lazyRoute(() => import('./components/KelpieMarkPreview'));
const MileHighMarkPreview = lazyRoute(() => import('./components/MileHighMarkPreview'));
const TravelModeSettings = lazyRoute(() => import('./components/TravelModeSettings'));
const MapPresenceSettings = lazyRoute(() => import('./components/MapPresenceSettings'));
const DlModeDefaultNotice = lazyRoute(() => import('./components/DlModeDefaultNotice'));
const FirstFeedPostPrompt = lazyRoute(() => import('./components/FirstFeedPostPrompt'));
const OnboardingPreview = lazyRoute(() => import('./components/OnboardingPreview'));
const AdminOnboardingReplay = lazyRoute(() => import('./components/AdminOnboardingReplay'));
const SupportPage = lazyRoute(() => import('./components/SupportPage'));
const GhostModeSettings = lazyRoute(() => import('./components/GhostModeSettings'));
const PrivacyAudit = lazyRoute(() => import('./components/PrivacyAudit'));
const FeelingLucky = lazyRoute(() => import('./components/FeelingLucky'));
const RequestsDashboard = lazyRoute(() => import('./components/RequestsDashboard'));
const CodeOfConductGate = lazyRoute(() => import('./components/CodeOfConductGate'));
const CodeOfConductPage = lazyRoute(() => import('./components/CodeOfConductPage'));
const EmailVerificationGate = lazyRoute(() => import('./components/EmailVerificationGate'));
const DebugCruushPlusToggle = lazyRoute(() => import('./components/DebugCruushPlusToggle'));
const Rewards = lazyRoute(() => import('./components/Rewards'));
const EarnedCruushPlusCards = lazyRoute(() => import('./components/EarnedCruushPlusCards'));
const CruushPlusSuccess = lazyRoute(() => import('./components/CruushPlusSuccess'));
const AlphaBugButton = lazyRoute(() => import('./components/AlphaBugButton'));
const TwoFactorSettings = lazyRoute(() => import('./components/TwoFactorSettings'));
const PublicInfoPage = lazyRoute(() => import('./components/PublicInfoPage'));
const Tutorial = lazyRoute(() => import('./components/Tutorial'));
const Changelog = lazyRoute(() => import('./components/Changelog'));
const Survey = lazyRoute(() => import('./components/Survey'));

const PUBLIC_INFO_ROUTES = [
  { path: '/about', page: 'about' },
  { path: '/terms', page: 'terms' },
  { path: '/privacy', page: 'privacy' },
  { path: '/safety', page: 'safety' },
  { path: '/security', page: 'security' },
  { path: '/content-removal', page: 'content-removal' },
  { path: '/human-trafficking-policy', page: 'human-trafficking' },
  { path: '/takedown-policy', page: 'takedown' },
  { path: '/2257', page: '2257' },
] as const;

function renderPublicRoutes(includeSupport = false, signedIn = false) {
  return [
    ...PUBLIC_INFO_ROUTES.map((route) => (
      <Route key={route.path} path={route.path} element={<PublicInfoPage page={route.page} signedIn={signedIn} />} />
    )),
    <Route key="/feed/photo-preview" path="/feed/photo-preview" element={<FeedPhotoPreview />} />,
    ...(import.meta.env.DEV
      ? [<Route key="/dev/onboarding-preview" path="/dev/onboarding-preview" element={<OnboardingPreview />} />]
      : []),
    ...(includeSupport
      ? [<Route key="/support" path="/support" element={<SupportPage publicAccess signedIn={signedIn} />} />]
      : []),
  ];
}

function redirectToMap() {
  window.history.replaceState({}, '', '/map');
}

function redirectAfterAuthentication() {
  if (window.location.pathname !== '/survey') {
    redirectToMap();
  }
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

function AppLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <LoadingCardSkeletons className="w-full max-w-lg" count={3} label={label} />
    </div>
  );
}

function RouteLoading() {
  return <AppLoading label="Loading page" />;
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

  if (step === 'profile-edit') {
    return '/profile/edit';
  }

  if (step === 'cruush-plus') {
    return '/rewards';
  }

  if (step === 'mile-high-club') {
    return '/settings/travel';
  }

  return '/map';
}

function MapTutorialRouteFollower() {
  const location = useLocation();
  const navigate = useNavigate();
  const savedStep = getStoredMapControlsTutorialStep();

  if (!savedStep || location.pathname === '/map' || location.pathname === '/settings/onboarding-test') {
    return null;
  }

  const followStep = (step: MapControlsTutorialStepId) => {
    const destination = mapTutorialRoute(step);

    if (location.pathname !== destination) {
      navigate(destination);
    }
  };

  const completeTutorial = (completed: boolean) => {
    markNoticeDismissed(MAP_CONTROLS_TUTORIAL_STORAGE_KEY);
    notifyMapControlsTutorialCompleted();
    if (completed) {
      void recordTutorialCompletion().catch(() => undefined);
    }
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

  if (searchParams.has('confirmEmailToken')) {
    return 'confirm-email';
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
  useSyncDistancePreferences(authStatus === 'signed_in' ? session?.user.id : null);
  useEffect(() => {
    if (authStatus === 'signed_in') {
      void refreshExistingPushSubscription().catch(() => undefined);
    }
  }, [authStatus, session?.user.id]);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showOnboardingReward, setShowOnboardingReward] = useState(false);
  const devOnboardingPreview = import.meta.env.DEV && window.location.pathname === '/dev/onboarding-preview';
  const authShellControlsScrolled = useAuthShellControlsScrolled(authStatus === 'signed_out');

  useEffect(() => {
    if (devOnboardingPreview) {
      setAuthStatus('signed_out');
      return undefined;
    }

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
  }, [devOnboardingPreview]);

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
      redirectAfterAuthentication();
    }
    setNeedsOnboarding(session.needsOnboarding);
    setAuthStatus('signed_in');
  };

  const handleVerified = (nextSession: AuthSessionPayload) => {
    setSession(nextSession);
    setNeedsOnboarding(nextSession.needsOnboarding);
    redirectAfterAuthentication();
    setAuthStatus('signed_in');
  };

  const handleSignedOut = () => {
    setShowOnboardingReward(false);
    setSession(null);
    setNeedsOnboarding(false);
    setAuthStatus('signed_out');
  };

  const handleOnboardingComplete = (
    nextSession?: AuthSessionPayload,
    destination: 'map' | 'rewards' = 'map',
    rewardGranted = false,
  ) => {
    setShowOnboardingReward(rewardGranted);
    if (nextSession) {
      setSession(nextSession);
      setNeedsOnboarding(nextSession.needsOnboarding);
    } else {
      setNeedsOnboarding(false);
    }
    if (window.location.pathname === '/survey') {
      window.history.replaceState({}, '', '/survey');
    } else if (destination === 'rewards') {
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

  if (devOnboardingPreview) {
    return (
      <BrowserRouter key="dev-onboarding-preview-router">
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="*" element={<OnboardingPreview />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  if (authStatus === 'loading') {
    return <AppLoading label="Loading session" />;
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

  if (tokenLinkType === 'confirm-email') {
    return (
      <BrowserRouter key="root-confirm-email-router">
        <GoogleAnalyticsPageTracker />
        <Routes>
          <Route path="*" element={<ConfirmEmailChange />} />
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
            {renderPublicRoutes(true, true)}
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
            {renderPublicRoutes(true, true)}
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
            {renderPublicRoutes(true, true)}
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
            {renderPublicRoutes(true, true)}
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
        <AppViewport>
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
              {renderPublicRoutes(false, true)}
              <Route path="/survey" element={<Survey />} />
              <Route path="/groups/:groupId" element={<GroupDetail />} />
              <Route path="/events/:eventId/pass-guide" element={<EventPassGuide />} />
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
              <Route path="/settings/code-of-conduct" element={<CodeOfConductPage />} />
              <Route path="/settings/blocked-users" element={<BlockedUsersPage />} />
              <Route path="/settings/notifications" element={<NotificationSettings />} />
              <Route path="/settings/2fa" element={<TwoFactorSettings />} />
              <Route path="/settings/tutorial" element={<Tutorial />} />
              <Route path="/settings/onboarding-test" element={canTestOnboarding(session.user)
                ? <AdminOnboardingReplay codeOfConductVersion={session.codeOfConductVersion} />
                : <Navigate to="/settings" replace />} />
              <Route path="/settings/changelog" element={<Changelog />} />
              <Route path="/support" element={<SupportPage signedIn />} />
              <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
              <Route path="/privacy/dl-mode" element={<DlModeSettings />} />
              <Route path="/privacy/map-presence" element={<MapPresenceSettings />} />
              <Route path="/settings/travel" element={<TravelModeSettings />} />
              <Route path="/settings/kelpie-marks" element={<KelpieMarkPreview />} />
              <Route path="/settings/mile-high-marks" element={<MileHighMarkPreview />} />
              <Route path="/settings/hankies" element={<HankyPreview />} />
              <Route path="/privacy/audit" element={<PrivacyAudit />} />
              <Route path="/lucky" element={<FeelingLucky />} />
              <Route path="/requests" element={<RequestsDashboard />} />
              <Route path="/upgrade" element={<Navigate to="/rewards" replace />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/checkout/success" element={<CruushPlusSuccess />} />
              <Route path="/checkout/:sessionId" element={<Navigate to="/rewards" replace />} />
              <Route path="*" element={<Navigate to="/map" replace />} />
            </Routes>
            <MapTutorialRouteFollower />
            <MobileInstallPrompt />
            <DlModeDefaultNotice />
            <FirstFeedPostPrompt userId={session.user.id} />
            <ForegroundNotifications showLatestRewardOnFirstPoll={showOnboardingReward} />
            <EarnedCruushPlusCards key={session.user.id} userId={session.user.id} />
            <DebugCruushPlusToggle />
            {alphaBugControl}
          </Suspense>
          <BottomNav />
          <Toaster closeButton position="top-center" richColors />
        </AppViewport>
      </AppErrorBoundary>
    </MemoryRouter>
  );
}
