import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useEffect, useState } from 'react';
import MapHome from './components/MapHome';
import LocalFeed from './components/LocalFeed';
import ProfileView from './components/ProfileView';
import ProfileEdit from './components/ProfileEdit';
import ProfileOnboarding from './components/ProfileOnboarding';
import FiltersPanel from './components/FiltersPanel';
import SafetyCenter from './components/SafetyCenter';
import GroupDetail from './components/GroupDetail';
import EventDetail from './components/EventDetail';
import PlaceDetail from './components/PlaceDetail';
import PrivateGroupChat from './components/PrivateGroupChat';
import DirectMessages from './components/DirectMessages';
import CruushActivity from './components/CruushActivity';
import Auth from './components/Auth';
import Settings from './components/Settings';
import FeelingLucky from './components/FeelingLucky';
import RequestsDashboard from './components/RequestsDashboard';
import VerifyEmail from './components/VerifyEmail';
import EmailVerificationGate from './components/EmailVerificationGate';
import ResetPassword from './components/ResetPassword';
import BottomNav from './components/BottomNav';
import AppErrorBoundary from './components/AppErrorBoundary';
import DebugCruushPlusToggle from './components/DebugCruushPlusToggle';
import { Toaster } from './components/ui/sonner';
import { loadCurrentSession } from './lib/sessionUser';
import type { AuthSessionPayload } from './lib/authApi';

function redirectToMap() {
  window.history.replaceState({}, '', '/map');
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

export default function App() {
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

  const handleOnboardingComplete = () => {
    redirectToMap();
    setNeedsOnboarding(false);
  };

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading session...</div>
      </div>
    );
  }

  const tokenLinkType = getTokenLinkType();

  if (tokenLinkType === 'verify-email') {
    return (
      <BrowserRouter key="root-verification-router">
        <Routes>
          <Route path="*" element={<VerifyEmail />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (tokenLinkType === 'reset-password') {
    return (
      <BrowserRouter key="root-reset-router">
        <Routes>
          <Route path="*" element={<ResetPassword />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (authStatus === 'signed_out') {
    return (
      <BrowserRouter key="public-router">
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Auth onAuth={handleAuth} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (!session?.user.emailVerifiedAt) {
    return (
      <BrowserRouter key="verification-router">
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
      </BrowserRouter>
    );
  }

  if (needsOnboarding) {
    return (
      <BrowserRouter key="onboarding-router">
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<ProfileOnboarding onComplete={handleOnboardingComplete} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter key="app-router">
      <AppErrorBoundary>
        <div className="min-h-screen bg-background text-foreground">
          <Routes>
            <Route path="/" element={<Navigate to="/map" replace />} />
            <Route path="/map" element={<MapHome />} />
            <Route path="/feed" element={<LocalFeed />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route path="/profile/:userId" element={<ProfileView />} />
            <Route path="/profile/edit" element={<ProfileEdit />} />
            <Route path="/filters" element={<FiltersPanel />} />
            <Route path="/safety" element={<SafetyCenter />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/groups/:groupId" element={<GroupDetail />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/places/:placeId" element={<PlaceDetail />} />
            <Route path="/chat/:chatId" element={<PrivateGroupChat />} />
            <Route path="/chat/group/:chatId" element={<PrivateGroupChat />} />
            <Route path="/messages" element={<DirectMessages />} />
            <Route path="/cruush" element={<CruushActivity />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/lucky" element={<FeelingLucky />} />
            <Route path="/requests" element={<RequestsDashboard />} />
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
          <BottomNav />
          <DebugCruushPlusToggle />
          <Toaster closeButton position="top-center" richColors />
        </div>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}
