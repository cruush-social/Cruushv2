import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import ProfilePhotoGallery from './ProfilePhotoGallery';
import ProfileEdit from './ProfileEdit';
import { ProfileDetailsTabs, profileRecordToProfileView } from './ProfileView';
import { revokeMutualCruush, revokeSentCruush, sendCruush } from '../lib/cruushApi';
import {
  handleCruushSendSuccess,
  handleMutualCruushRevokeSuccess,
  handleSentCruushRevokeSuccess,
  notifyCruushSendError,
  notifyMutualCruushRevokeError,
  notifySentCruushRevokeError,
} from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { emptyProfilePayload, getMyProfile, getProfileById, type ProfileRecord } from '../lib/profileApi';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import sendIconWhite from '../assets/ui-icons/send-white.png';

interface MapProfilePopupProps {
  user: any;
  onClose: () => void;
  fixed?: boolean;
  isOwnProfile?: boolean;
  onBlockedUser?: (userId: string) => void;
  onProfileSaved?: (profile: ProfileRecord) => void;
}

export default function MapProfilePopup({
  user,
  onClose,
  fixed = false,
  isOwnProfile = false,
  onBlockedUser,
  onProfileSaved,
}: MapProfilePopupProps) {
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [revokingCruush, setRevokingCruush] = useState(false);
  const [mutualRevoked, setMutualRevoked] = useState(false);
  const [outgoingRevoked, setOutgoingRevoked] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [activeTab, setActiveTab] = useState('basics');
  const [fullProfile, setFullProfile] = useState<ProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [ownProfileMode, setOwnProfileMode] = useState<'view' | 'edit'>('view');
  const isDemo = user.isDemo === true;

  useEffect(() => {
    let isMounted = true;

    setActiveTab('basics');
    setOwnProfileMode('view');
    setFullProfile(null);
    setCruushed(false);
    setCruushBecameMutual(false);
    setMutualRevoked(false);
    setOutgoingRevoked(false);
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
  }, [isDemo, isOwnProfile, user.id]);

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
  const displayPhotos = profileView?.photos ?? (user.photo ? [user.photo] : []);
  const displayPhotoMetadata = profileView?.photoMetadata ?? (user.photo ? [{
    url: user.photo,
    explicit: user.photoExplicit === true,
  }] : []);
  const displayBadges = profileView?.badges ?? user.badges;
  const displayDistance = profileView?.distance ?? user.distance;
  const displayLastActive = profileView?.lastActive ?? user.lastActive;
  const isAlreadyMutual = !isOwnProfile && !mutualRevoked && (cruushBecameMutual || profileView?.relationship?.mutual_cruush === true || user.relationship?.mutualCruush === true);
  const hasSentCruush = !isAlreadyMutual && !outgoingRevoked && (cruushed || profileView?.relationship?.outgoing_cruush === true);
  const hasRevocableCruush = isAlreadyMutual || hasSentCruush;
  const canMessage = profileView?.relationship ? profileView.relationship.can_message : user.relationship?.canMessage;
  const cruushDisabled = isDemo || sendingCruush || revokingCruush;

  const popupClassName = `${fixed ? 'fixed' : 'absolute'} bottom-[calc(0.75rem+env(safe-area-inset-bottom))] right-6 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 block w-[26rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[28px] border border-white/10 bg-black/80 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl`;

  const handleCruush = async () => {
    if (isDemo || isOwnProfile || sendingCruush || revokingCruush || hasSentCruush || isAlreadyMutual) {
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
      setMutualRevoked(false);
      setOutgoingRevoked(false);
      handleCruushSendSuccess(user.id, displayName, data);
    } catch (error) {
      console.error('Error sending cruush:', error);
      notifyCruushSendError(error);
    } finally {
      setSendingCruush(false);
    }
  };

  const handleRevokeCruush = async () => {
    if (isDemo || isOwnProfile || !hasRevocableCruush || sendingCruush || revokingCruush) {
      return;
    }

    const mutual = isAlreadyMutual;
    setRevokingCruush(true);
    try {
      if (mutual) {
        await revokeMutualCruush(user.id);
      } else {
        await revokeSentCruush(user.id);
      }
      setCruushed(false);
      setCruushBecameMutual(false);
      setOutgoingRevoked(true);
      if (mutual) {
        setMutualRevoked(true);
        handleMutualCruushRevokeSuccess(user.id, displayName);
      } else {
        handleSentCruushRevokeSuccess(user.id, displayName);
      }
    } catch (error) {
      console.error('Error revoking cruush:', error);
      if (mutual) {
        notifyMutualCruushRevokeError(error);
      } else {
        notifySentCruushRevokeError(error);
      }
    } finally {
      setRevokingCruush(false);
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
        <div className="profile-card-scroll h-full">
          <ProfileEdit
            embedded
            onCancel={() => setOwnProfileMode('view')}
            onSaved={(savedProfile) => {
              const nextProfile = {
                ...emptyProfilePayload,
                ...savedProfile,
              };

              setFullProfile(nextProfile);
              onProfileSaved?.(nextProfile);
              setOwnProfileMode('view');
            }}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className={popupClassName}>
      <div className="profile-card-scroll h-full">
        <div className="relative overflow-hidden">
          <ProfilePhotoGallery
            name={displayName}
            photoMetadata={displayPhotoMetadata}
            photos={displayPhotos}
            userId={profileView?.id ?? user.id}
          />
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
              {!isOwnProfile && !isDemo ? (
                <>
                  <ReportAction
                    targetType="profile"
                    targetId={user.id}
                    targetLabel={displayName}
                    label={`Report ${displayName}`}
                    className="h-9 w-9 rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
                  />
                  <BlockUserAction
                    userId={user.id}
                    displayName={displayName}
                    className="h-9 w-9 rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
                    onBlocked={(blockedUserId) => {
                      onBlockedUser?.(blockedUserId);
                      onClose();
                    }}
                  />
                </>
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
                <div className="mt-1">
                  <CruushBadge badges={displayBadges} compact />
                </div>
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
              onClick={() => {
                void (hasRevocableCruush ? handleRevokeCruush() : handleCruush());
              }}
              disabled={cruushDisabled}
              className="h-12 w-12 rounded-2xl border-0 px-0 text-white"
              style={{
                background: hasRevocableCruush
                  ? 'rgba(255,0,114,0.18)'
                  : cruushDisabled
                  ? 'rgba(255,255,255,0.16)'
                  : 'var(--cruush-gradient)',
              }}
              aria-label={isDemo ? 'Demo profile' : revokingCruush ? (isAlreadyMutual ? 'Removing mutual cruush' : 'Unsending cruush') : isAlreadyMutual ? 'Remove mutual cruush' : hasSentCruush ? 'Unsend cruush' : sendingCruush ? 'sending cruush' : 'send cruush'}
            >
              <CruushIcon name="safety" className={`h-6 w-6 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant="white" />
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
