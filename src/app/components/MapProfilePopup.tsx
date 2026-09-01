import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import ProfilePhotoGallery from './ProfilePhotoGallery';
import DesktopDockPanel from './DesktopDockPanel';
import ProfileEdit from './ProfileEdit';
import { PROFILE_OVERLAY_TEXT_STYLE, ProfileDetailsTabs, profileRecordToProfileView } from './ProfileView';
import { resolveVibeTone, vibeCapsuleStyle } from '../lib/vibeTone';
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
import mileHighClubWhite from '../assets/ui-icons/mile-high-club-white.svg';
import sendIconWhite from '../assets/ui-icons/send-white.png';
import DarkRoomMark from './DarkRoomMark';
import LoadingCardSkeletons from './LoadingCardSkeletons';

interface MapProfilePopupProps {
  user: any;
  onClose: () => void;
  fixed?: boolean;
  isOwnProfile?: boolean;
  onBlockedUser?: (userId: string) => void;
  /** Desktop keeps the map up and opens the thread in the other dock. */
  onOpenMessages?: (userId: string) => void;
  onProfileSaved?: (profile: ProfileRecord) => void;
}

export default function MapProfilePopup({
  user,
  onClose,
  fixed = false,
  isOwnProfile = false,
  onBlockedUser,
  onOpenMessages,
  onProfileSaved,
}: MapProfilePopupProps) {
  const navigate = useNavigate();
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

  const canRevealPreciseLocation = fullProfile?.viewer_relationship?.can_reveal_precise_location === true;
  const targetInDarkRoom = fullProfile?.viewer_relationship?.location_mode === 'STEALTH';
  const displayName = profileView?.name ?? user.name;
  const displayAge = profileView?.age ?? user.age;
  const displayTravelling = profileView?.travelling ?? user.travelling === true;
  const displayTravelLabel = profileView?.travelLabel ?? user.travelLabel ?? '';
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
  // A mutual can always message, which is the rule the server applies too, so a
  // stale or missing relationship payload never blocks a match.
  const isMutualCruush = profileView?.relationship?.mutual_cruush === true
    || user.relationship?.mutualCruush === true;
  const canMessage = isMutualCruush
    || (profileView?.relationship ? profileView.relationship.can_message : user.relationship?.canMessage);
  const cruushDisabled = isDemo || sendingCruush || revokingCruush;
  const pinActionable = canRevealPreciseLocation && !targetInDarkRoom;


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
      // Opening the thread has to work from every surface, so it always goes
      // through the same path the messages page uses.
      await openConversationOrInbox(
        navigate,
        user.id,
        onOpenMessages ? () => onOpenMessages(user.id) : undefined,
      );
    } finally {
      setOpeningMessage(false);
    }
  };

  if (isOwnProfile && ownProfileMode === 'edit') {
    return (
      <DesktopDockPanel slot="left" ariaLabel="Edit profile preview">
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
      </DesktopDockPanel>
    );
  }

  return (
    <DesktopDockPanel slot="left" ariaLabel={isOwnProfile ? 'Your profile' : `${displayName} profile`}>
      <div className="profile-card-scroll h-full">
        <div className="relative overflow-hidden">
          <ProfilePhotoGallery
            name={displayName}
            photoMetadata={displayPhotoMetadata}
            photos={displayPhotos}
            userId={profileView?.id ?? user.id}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 py-4 pl-4 pr-1">
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
                <h3 className="flex min-w-0 items-center text-3xl text-white">
                  <span className="min-w-0 truncate">{displayName}</span>
                  {displayAge ? <span className="shrink-0 whitespace-nowrap text-white/80">, {displayAge}</span> : null}
                  {displayTravelling ? (
                    <img
                      alt="Mile High Club"
                      className="ml-2 h-5 w-5 shrink-0"
                      src={mileHighClubWhite}
                      title={displayTravelLabel ? `Mile High Club: ${displayTravelLabel}` : 'Mile High Club'}
                    />
                  ) : null}
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

            {/* The photo carries the signal and the vibes here too, the way it
                does on the profile page. */}
            {profileView?.signal ? (
              <p
                className="mt-2 truncate text-base leading-snug text-white"
                data-testid="popup-overlay-signal"
                style={PROFILE_OVERLAY_TEXT_STYLE}
              >
                {profileView.signal}
              </p>
            ) : null}

            {profileView?.vibes.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="popup-overlay-vibes">
                {profileView.vibes.slice(0, 3).map((vibe) => (
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11px] uppercase leading-tight tracking-[0.08em]"
                    key={vibe}
                    style={vibeCapsuleStyle(resolveVibeTone({
                      mutual: profileView.relationship?.mutual_cruush,
                      isCurrentUser: isOwnProfile,
                    }))}
                  >
                    {vibe}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 text-white">
          {profileView ? (
            <ProfileDetailsTabs
              activeTab={activeTab}
              compact
              hideTopOverlayDuplicates={isOwnProfile}
              onActiveTabChange={setActiveTab}
              profileView={profileView}
            />
          ) : (
            profileLoading
              ? <LoadingCardSkeletons count={2} label="Loading profile details" />
              : <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">{profileError ?? 'Profile details are unavailable.'}</div>
          )}
        </div>

        {!isOwnProfile ? (
          <div className="sticky bottom-0 border-t border-white/10 bg-black/85 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                void (hasRevocableCruush ? handleRevokeCruush() : handleCruush());
              }}
              disabled={cruushDisabled}
              className="h-12 w-12 rounded-2xl border-0 px-0 text-white"
              style={{
                background: hasRevocableCruush
                  ? 'var(--cruush-gradient-soft-28)'
                  : cruushDisabled
                  ? 'rgba(255,255,255,0.16)'
                  : 'var(--cruush-gradient)',
              }}
              aria-label={isDemo ? 'Demo profile' : revokingCruush ? (isAlreadyMutual ? 'Removing mutual' : 'Unsending cruush') : isAlreadyMutual ? 'Remove mutual' : hasSentCruush ? 'Unsend cruush' : sendingCruush ? 'sending cruush' : 'send cruush'}
            >
              <CruushIcon name="mutual" className={`h-6 w-6 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant="white" />
            </Button>

            <Button
              type="button"
              className="h-12 w-12 rounded-2xl border-0 px-0 text-white disabled:opacity-100"
              style={{ background: pinActionable ? 'var(--cruush-gradient)' : 'var(--cruush-gradient-soft-28), #0A0A12' }}
              aria-label={pinActionable
                ? `Center the map on ${displayName}`
                : targetInDarkRoom
                  ? `${displayName} is in Dark Room`
                  : `${displayName} does not share their precise location`}
              title={pinActionable
                ? `Center the map on ${displayName}`
                : targetInDarkRoom
                  ? 'Dark Room'
                  : 'Precise location unavailable'}
              disabled={!pinActionable}
              onClick={() => navigate('/map', { state: { focusUserId: user.id } })}
            >
              {targetInDarkRoom
                ? <DarkRoomMark active className="h-5 w-5 opacity-55" />
                : <CruushIconImage src={mapIconWhite} className={`h-5 w-5 ${pinActionable ? '' : 'opacity-45'}`} />}
            </Button>

            <Button
              className="h-12 min-w-0 flex-1 justify-center rounded-2xl border-0 text-base text-white"
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
    </DesktopDockPanel>
  );
}
