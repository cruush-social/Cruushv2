import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';
import CruiseCarouselSlot from './CruiseCarouselSlot';
import ProfileCard from './ProfileCard';
import { getMyBillingStatus } from '../lib/billingApi';
import { decryptDisplayLocationToken } from '../lib/displayLocationTokens';
import { getMyProfile, type ProfileRecord } from '../lib/profileApi';
import { getNearbyUsers, type DiscoveryUser } from '../lib/usersApi';

type LuckyStatus = 'checking' | 'browsing' | 'profile' | 'locked' | 'empty' | 'error';

function selectCarouselUser(users: DiscoveryUser[], currentTargetId?: string | null) {
  const eligibleUsers = users.filter((user) => !user.isDemo && !user.isCurrentUser);

  if (eligibleUsers.length === 0) {
    return null;
  }

  const alternateUsers = eligibleUsers.filter((user) => user.id !== currentTargetId);
  const pool = alternateUsers.length > 0 ? alternateUsers : eligibleUsers;
  return pool[Math.floor(Math.random() * pool.length)];
}

function profileLocationToCoordinates(profile: ProfileRecord | null) {
  const location = profile?.location;
  const latitude = location?.fuzzy_lat ?? location?.lat ?? null;
  const longitude = location?.fuzzy_lng ?? location?.lng ?? null;

  if (latitude == null || longitude == null) {
    return null;
  }

  return {
    lat: latitude,
    lng: longitude,
  };
}

async function loadProfileDiscoveryCoordinates() {
  try {
    const profile = await getMyProfile();

    if (profile.location?.display_location_token) {
      const displayPayload = await decryptDisplayLocationToken(profile.location.display_location_token);
      return {
        lat: displayPayload.latitude,
        lng: displayPayload.longitude,
      };
    }

    return profileLocationToCoordinates(profile);
  } catch {
    return null;
  }
}

export default function FeelingLucky() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LuckyStatus>('checking');
  const [candidateUsers, setCandidateUsers] = useState<DiscoveryUser[]>([]);
  const [targetUser, setTargetUser] = useState<DiscoveryUser | null>(null);
  const [browseNonce, setBrowseNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startBrowse = (users: DiscoveryUser[], currentTargetId?: string | null) => {
    const nextUser = selectCarouselUser(users, currentTargetId);
    setBrowseNonce((nonce) => nonce + 1);

    if (!nextUser) {
      setTargetUser(null);
      setStatus('empty');
      return;
    }

    setTargetUser(nextUser);
    setStatus('browsing');
  };

  const loadCarousel = async () => {
    setStatus('checking');
    setError(null);
    setTargetUser(null);

    let billingStatus;
    try {
      billingStatus = await getMyBillingStatus();
    } catch {
      setStatus('locked');
      return;
    }

    if (!billingStatus.cruushPlus) {
      // Basic members still watch real nearby profiles go by; only the landing
      // frame is the cruush+ pitch.
      try {
        const coordinates = await loadProfileDiscoveryCoordinates();
        setCandidateUsers(await getNearbyUsers(coordinates, undefined, { limit: 20 }));
      } catch {
        setCandidateUsers([]);
      }

      setStatus('locked');
      return;
    }

    try {
      const coordinates = await loadProfileDiscoveryCoordinates();
      const nearbyUsers = await getNearbyUsers(coordinates, undefined, { limit: 20 });
      setCandidateUsers(nearbyUsers);
      startBrowse(nearbyUsers);
    } catch (loadError) {
      console.error('Error loading cruise carousel:', loadError);
      setCandidateUsers([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load cruise carousel.');
      setStatus('error');
    }
  };

  useEffect(() => {
    void loadCarousel();
  }, []);

  const handleBrowseAgain = () => {
    startBrowse(candidateUsers, targetUser?.id);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#050505] pb-[calc(5rem+env(safe-area-inset-bottom))] text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/10 bg-black/88 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <CruushIcon name="lucky" className="h-5 w-5" variant="colored" />
          <h1 className="text-xl">cruise carousel</h1>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-2 px-2 pt-0 sm:px-4 sm:pt-2">
        {status === 'checking' ? (
          <div className="rounded-2xl border border-white/10 bg-black/72 p-5 text-center text-sm text-white/68">
            Loading cruise carousel...
          </div>
        ) : null}

        {status === 'locked' ? (
          <CruiseCarouselSlot
            key={`locked-${browseNonce}`}
            mode="locked"
            candidateUsers={candidateUsers}
            variant="page"
            onUpgrade={() => navigate('/rewards')}
          />
        ) : null}

        {status === 'browsing' && targetUser ? (
          <CruiseCarouselSlot
            key={`profile-${targetUser.id}-${browseNonce}`}
            mode="profile"
            candidateUsers={candidateUsers}
            targetUser={targetUser}
            variant="page"
            onComplete={() => setStatus('profile')}
          />
        ) : null}

        {status === 'profile' && targetUser ? (
          <div data-testid="lucky-profile-result" className="flex min-h-0 flex-1 flex-col gap-2">
            <ProfileCard
              density="compact"
              fillAvailableHeight
              placement="inline"
              presentation="carousel"
              user={targetUser}
              onBrowseAgain={handleBrowseAgain}
              onClose={() => navigate(-1)}
              onViewProfile={() => navigate(`/profile/${targetUser.id}`)}
            />
          </div>
        ) : null}

        {status === 'empty' ? (
          <CruiseCarouselSlot
            key={`empty-${browseNonce}`}
            mode="empty"
            variant="page"
            onRetry={() => {
              void loadCarousel();
            }}
          />
        ) : null}

        {status === 'error' ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-center">
            <p className="text-sm text-destructive">{error ?? 'Unable to load cruise carousel.'}</p>
            <Button
              type="button"
              className="mt-4 h-11 rounded-xl text-white"
              style={{ background: 'var(--cruush-gradient)' }}
              onClick={() => {
                void loadCarousel();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
