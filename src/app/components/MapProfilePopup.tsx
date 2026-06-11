import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import CruushIconImage from './CruushIconImage';
import ProfileEdit from './ProfileEdit';
import { ProfileDetailsTabs, profileRecordToProfileView } from './ProfileView';
import { sendCruush } from '../lib/cruushApi';
import { handleCruushSendSuccess, notifyCruushSendError } from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { emptyProfilePayload, getMyProfile, getProfileById, type ProfileRecord } from '../lib/profileApi';
import { PROFILE_HERO_ASPECT_STYLE } from '../lib/photoLayout';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import sendIconWhite from '../assets/ui-icons/send-white.png';

interface MapProfilePopupProps {
  user: any;
  onClose: () => void;
  fixed?: boolean;
  isOwnProfile?: boolean;
}

export default function MapProfilePopup({ user, onClose, fixed = false, isOwnProfile = false }: MapProfilePopupProps) {
  const navigate = useNavigate();
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [activeTab, setActiveTab] = useState('basics');
  const [fullProfile, setFullProfile] = useState<ProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [ownProfileMode, setOwnProfileMode] = useState<'view' | 'edit'>('view');
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const isDemo = user.isDemo === true;

  useEffect(() => {
    let isMounted = true;

    setActiveTab('basics');
    setOwnProfileMode('view');
    setFullProfile(null);
    setCruushed(false);
    setCruushBecameMutual(false);
    setProfileError(null);

    if (isDemo) {
      setProfileLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setProfileLoading(true);
    const profileRequest = isOwnProfile ? getMyProfile() : getProfileById(user.id);

    profileRequest
      .then((profile) => {
        if (!isMounted) {
          return;
        }

        setFullProfile({
          ...emptyProfilePayload,
          ...profile,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        console.error('Error loading profile preview:', error);
        setProfileError(error instanceof Error ? error.message : 'Profile details could not load.');
      })
      .finally(() => {
        if (isMounted) {
          setProfileLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isDemo, isOwnProfile, profileReloadKey, user.id]);

  const profileView = useMemo(() => {
    if (!fullProfile) {
      return null;
    }

    return profileRecordToProfileView(fullProfile, {
      distance: user.distance,
      lastActive: user.lastActive,
    });
  }, [fullProfile, user.distance, user.lastActive]);

  const displayName = profileView?.name ?? user.name;
  const displayAge = profileView?.age ?? user.age;
  const displayPronouns = profileView?.pronouns ?? user.pronouns;
  const displayPhoto = profileView?.photos[0] ?? user.photo;
  const displayDistance = profileView?.distance ?? user.distance;
  const displayLastActive = profileView?.lastActive ?? user.lastActive;
  const isAlreadyMutual = !isOwnProfile && (cruushBecameMutual || profileView?.relationship?.mutual_cruush === true || user.relationship?.mutualCruush === true);
  const hasSentCruush = cruushed || profileView?.relationship?.outgoing_cruush === true;
  const canMessage = profileView?.relationship ? profileView.relationship.can_message : user.relationship?.canMessage;
  const cruushDisabled = isDemo || sendingCruush || hasSentCruush || isAlreadyMutual;

  const popupClassName = `${fixed ? 'fixed' : 'absolute'} bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-6 top-[8.75rem] z-50 hidden w-[23rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[28px] border border-white/10 bg-black/80 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl lg:block`;

  const handleCruush = async () => {
    if (isDemo || isOwnProfile || sendingCruush || hasSentCruush || isAlreadyMutual) {
      return;
    }

    setSendingCruush(true);
    try {
      const data = await sendCruush(user.id, {
        name: displayName,
        pronouns: displayPronouns,
        photo: displayPhoto ?? null,
      });
      setCruushed(true);
      setCruushBecameMutual(data.mutual === true);
      handleCruushSendSuccess(user.id, displayName, data);
    } catch (error) {
      console.error('Error sending cruush:', error);
      notifyCruushSendError(error);
    } finally {
      setSendingCruush(false);
    }
  };

  const handleMessage = async () => {
    if (isDemo || canMessage === false || openingMessage) {
      return;
    }

    setOpeningMessage(true);
    try {
      await openConversationOrInbox(navigate, user.id);
    } finally {
      setOpeningMessage(false);
    }
  };

  if (isOwnProfile && ownProfileMode === 'edit') {
    return (
      <aside className={popupClassName} aria-label="Edit profile preview">
        <div className="scrollbar-hide h-full overflow-y-auto">
          <ProfileEdit
            embedded
            onCancel={() => setOwnProfileMode('view')}
            onSaved={() => {
              setOwnProfileMode('view');
              setProfileReloadKey((key) => key + 1);
            }}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className={popupClassName}>
      <div className="scrollbar-hide h-full overflow-y-auto">
        <div
          className="relative overflow-hidden"
          style={{ ...PROFILE_HERO_ASPECT_STYLE, background: 'var(--cruush-gradient)' }}
        >
          {displayPhoto ? (
            <img
              src={displayPhoto}
              alt={displayName}
              className="h-full w-full object-cover"
              style={PROFILE_HERO_ASPECT_STYLE}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <CruushIconImage src={cruushIconWhite} className="h-24 w-24 opacity-15" />
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
            <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
              {isOwnProfile ? 'Your profile' : 'Nearby now'}
            </div>
            <div className="flex items-center gap-2">
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => setOwnProfileMode('edit')}
                  className="h-9 rounded-full border border-white/10 bg-black/45 px-3 text-[11px] uppercase tracking-[0.14em] text-white/82 backdrop-blur-sm transition hover:text-white"
                >
                  Edit profile
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-sm transition hover:text-white"
                aria-label="Close profile preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-5 pb-5 pt-10">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-3xl text-white">
                  {displayName}
                  {displayAge ? <span className="text-white/80">, {displayAge}</span> : null}
                </h3>
                <p className="mt-1 text-sm text-white/80">{displayPronouns}</p>
              </div>
              {displayLastActive ? (
                <div className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80 backdrop-blur-sm">
                  {displayLastActive}
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
              <CruushIconImage src={mapIconWhite} className="h-4 w-4" />
              <span>{displayDistance || 'Nearby'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 text-white">
          {profileView ? (
            <ProfileDetailsTabs
              activeTab={activeTab}
              compact
              onActiveTabChange={setActiveTab}
              profileView={profileView}
            />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              {profileLoading ? 'Loading profile details...' : profileError ?? 'Profile details are unavailable.'}
            </div>
          )}
        </div>

        {!isOwnProfile ? (
        <div className="sticky bottom-0 border-t border-white/10 bg-black/85 px-5 py-4 backdrop-blur-xl">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Button
              onClick={handleCruush}
              disabled={cruushDisabled}
              className="h-12 w-12 rounded-2xl border-0 px-0 text-white"
              style={{
                background: cruushDisabled
                  ? 'rgba(255,255,255,0.16)'
                  : 'var(--cruush-gradient)',
              }}
              aria-label={isDemo ? 'Demo profile' : isAlreadyMutual ? 'Already mutual' : hasSentCruush ? 'Cruush sent' : sendingCruush ? 'Sending cruush' : 'Send cruush'}
            >
              <CruushIconImage src={cruushIconWhite} className={`h-6 w-6 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} />
            </Button>

            <Button
              className="h-12 justify-center rounded-2xl border-0 text-base text-white"
              style={{
                background: isDemo ? 'rgba(255,255,255,0.16)' : 'var(--cruush-gradient)',
              }}
              disabled={isDemo || canMessage === false || openingMessage}
              aria-label={isDemo ? 'Demo message unavailable' : openingMessage ? 'Opening conversation' : 'Message now'}
              onClick={() => {
                void handleMessage();
              }}
            >
              <CruushIconImage src={sendIconWhite} className="mr-2 h-4 w-4" />
              {isDemo ? 'Demo only' : canMessage === false ? 'Mutuals only' : openingMessage ? 'Opening...' : 'Message now'}
            </Button>
          </div>
        </div>
        ) : null}
      </div>
    </aside>
  );
}
