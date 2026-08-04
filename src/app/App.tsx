import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { lazy, Suspense, useEffect, useState } from 'react';
import Auth from './components/Auth';
import VerifyEmail from './components/VerifyEmail';
import ResetPassword from './components/ResetPassword';
import AppErrorBoundary from './components/AppErrorBoundary';
import GoogleAnalyticsPageTracker from './components/GoogleAnalyticsPageTracker';
import { Toaster } from './components/ui/sonner';
import { loadCurrentSession } from './lib/sessionUser';
import { canUseDeveloperMapToolsEmail } from './lib/developerMapTools';
import type { AuthSessionPayload } from './lib/authApi';

const MapHome = lazy(() => import('./components/MapHome'));
const LocalFeed = lazy(() => import('./components/LocalFeed'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const ProfileEdit = lazy(() => import('./components/ProfileEdit'));
const ProfileOnboarding = lazy(() => import('./components/ProfileOnboarding'));
const FiltersPanel = lazy(() => import('./components/FiltersPanel'));
const GroupDetail = lazy(() => import('./components/GroupDetail'));
const EventDetail = lazy(() => import('./components/EventDetail'));
const EventPassGuide = lazy(() => import('./components/EventPassGuide'));
const PlaceDetail = lazy(() => import('./components/PlaceDetail'));
const PrivateGroupChat = lazy(() => import('./components/PrivateGroupChat'));
const DirectMessages = lazy(() => import('./components/DirectMessages'));
const NotificationCenter = lazy(() => import('./components/NotificationCenter'));
const NotificationSettings = lazy(() => import('./components/NotificationSettings'));
const MobileInstallPrompt = lazy(() => import('./components/MobileInstallPrompt'));
const ReportPage = lazy(() => import('./components/ReportPage'));
const ModeratorReview = lazy(() => import('./components/ModeratorReview'));
const CruushActivity = lazy(() => import('./components/CruushActivity'));
const CruushMatchSettings = lazy(() => import('./components/CruushMatchSettings'));
const Settings = lazy(() => import('./components/Settings'));
const BlockedUsersPage = lazy(() => import('./components/BlockedUsersPage'));
const DlModeSettings = lazy(() => import('./components/DlModeSettings'));
const DlModeDefaultNotice = lazy(() => import('./components/DlModeDefaultNotice'));
const BetaLaunchCruushPlusOffer = lazy(() => import('./components/BetaLaunchCruushPlusOffer'));
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
const AlphaBugButton = lazy(() => import('./components/AlphaBugButton'));
const TwoFactorSettings = lazy(() => import('./components/TwoFactorSettings'));
const PublicInfoPage = lazy(() => import('./components/PublicInfoPage'));

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

function renderPublicInfoRoutes() {
  return PUBLIC_INFO_ROUTES.map((route) => (
    <Route key={route.path} path={route.path} element={<PublicInfoPage page={route.page} />} />
  ));
}

function redirectToMap() {
  window.history.replaceState({}, '', '/map');
}

function redirectToRewards() {
  window.history.replaceState({}, '', '/rewards');
}

function RouteLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
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

export default function App({
  humanModerationEnabled = true,
}: AppProps = {}) {
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed_out' | 'signed_in'>('loading');
  const [session, setSession] = useState<AuthSessionPayload | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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

  const handleCodeOfConductAccepted = (nextSession: AuthSessionPayload) => {
    setSession(nextSession);
    setNeedsOnboarding(nextSession.needsOnboarding);
  };

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading session...</div>
      </div>
    );
  }

  const tokenLinkType = getTokenLinkType();
  const alphaBugControl = session?.alphaTest?.active ? <AlphaBugButton enabled /> : null;

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
            {renderPublicInfoRoutes()}
            <Route path="*" element={<Auth onAuth={handleAuth} />} />
          </Routes>
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
            {renderPublicInfoRoutes()}
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
            {renderPublicInfoRoutes()}
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
            {renderPublicInfoRoutes()}
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
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter key="app-router">
      <GoogleAnalyticsPageTracker />
      <AppErrorBoundary>
        <div className="min-h-screen bg-background text-foreground">
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/map" replace />} />
              <Route path="/map" element={<MapHome developerToolsEnabled={canUseDeveloperMapToolsEmail(session?.user.email)} />} />
              <Route path="/feed" element={<LocalFeed />} />
              <Route path="/profile" element={<ProfileView />} />
              <Route path="/profile/:userId" element={<ProfileView />} />
              <Route path="/profile/edit" element={<ProfileEdit />} />
              <Route path="/filters" element={<FiltersPanel />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {renderPublicInfoRoutes()}
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
              <Route path="/support" element={<SupportPage />} />
              <Route path="/privacy/ghost-mode" element={<GhostModeSettings />} />
              <Route path="/privacy/dl-mode" element={<DlModeSettings />} />
              <Route path="/privacy/audit" element={<PrivacyAudit />} />
              {import.meta.env.DEV ? (
                <Route path="/dev/onboarding-preview" element={<OnboardingPreview />} />
              ) : null}
              <Route path="/lucky" element={<FeelingLucky />} />
              <Route path="/requests" element={<RequestsDashboard />} />
              <Route path="/upgrade" element={<Navigate to="/rewards" replace />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/checkout/success" element={<Navigate to="/rewards" replace />} />
              <Route path="/checkout/:sessionId" element={<Navigate to="/rewards" replace />} />
              <Route path="*" element={<Navigate to="/map" replace />} />
            </Routes>
            <MobileInstallPrompt />
            <DlModeDefaultNotice />
            <BetaLaunchCruushPlusOffer userId={session.user.id} />
            <FirstFeedPostPrompt userId={session.user.id} />
            <BottomNav />
            <DebugCruushPlusToggle />
            {alphaBugControl}
          </Suspense>
          <Toaster closeButton position="top-center" richColors />
        </div>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}
