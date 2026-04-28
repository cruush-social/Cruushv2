import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useState } from 'react';
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
import BottomNav from './components/BottomNav';
import AppErrorBoundary from './components/AppErrorBoundary';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('cruush_auth') === 'true';
  });
  const [needsOnboarding, setNeedsOnboarding] = useState(() => {
    if (!isAuthenticated) return false;
    const user = localStorage.getItem('cruush_user');
    if (!user) return false;
    const userData = JSON.parse(user);
    // Check if user has completed onboarding (has name and age)
    return !userData.name || !userData.age;
  });

  const handleAuth = (isNewUser: boolean) => {
    setIsAuthenticated(true);
    if (isNewUser) {
      setNeedsOnboarding(true);
    }
  };

  const handleOnboardingComplete = () => {
    setNeedsOnboarding(false);
  };

  if (!isAuthenticated) {
    return <Auth onAuth={handleAuth} />;
  }

  if (needsOnboarding) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<ProfileOnboarding onComplete={handleOnboardingComplete} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <div className="min-h-screen bg-background text-foreground">
          <Routes>
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/map" element={<MapHome />} />
            <Route path="/feed" element={<LocalFeed />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route path="/profile/:userId" element={<ProfileView />} />
            <Route path="/profile/edit" element={<ProfileEdit />} />
            <Route path="/filters" element={<FiltersPanel />} />
            <Route path="/safety" element={<SafetyCenter />} />
            <Route path="/groups/:groupId" element={<GroupDetail />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/places/:placeId" element={<PlaceDetail />} />
            <Route path="/chat/group/:chatId" element={<PrivateGroupChat />} />
            <Route path="/messages" element={<DirectMessages />} />
            <Route path="/cruush" element={<CruushActivity />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/lucky" element={<FeelingLucky />} />
            <Route path="/requests" element={<RequestsDashboard />} />
            <Route path="*" element={<Navigate to="/feed" replace />} />
          </Routes>
          <BottomNav />
        </div>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}
