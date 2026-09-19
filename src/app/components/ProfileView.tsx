import { shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import { IDENTITIES } from '../lib/profileOptions';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { resolveMediaUrl } from '../lib/apiClient';
import { useLocation, useNavigate, useParams } from 'react-router';
import { notifyProfileUnavailable } from '../lib/profileUnavailable';
import { ArrowLeft, Share2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import { resolveVibeTone, vibeCapsuleStyle } from '../lib/vibeTone';
import ProfilePhotoGallery from './ProfilePhotoGallery';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import { getMutualCruushMap, revokeMutualCruush, revokeSentCruush, sendCruush } from '../lib/cruushApi';
import { addCruushChangedListener } from '../lib/cruushEvents';
import {
  handleCruushSendSuccess,
  handleMutualCruushRevokeSuccess,
  handleSentCruushRevokeSuccess,
  notifyCruushSendError,
  notifyMutualCruushRequired,
  notifyMutualCruushRevokeError,
  notifySentCruushRevokeError,
} from '../lib/cruushNotifications';
import { addProfileChangedListener, emptyProfilePayload, getMyProfile, getProfileById, ProfileApiError, type ProfileRecord } from '../lib/profileApi';
import { openConversationOrInbox } from '../lib/openConversation';
import { formatDistanceWithAway, useDistancePreferences } from '../lib/distancePreferences';
import { resolveUserBorderTone } from '../lib/userBorderTone';
import partyHatIcon from '../assets/ui-icons/party-hat.svg';
import mileHighClubWhite from '../assets/ui-icons/mile-high-club-white.svg';
import InAppShareDialog from './InAppShareDialog';
import BugButtonSlot from './BugButtonSlot';

type ProfileLocationState = {
  distance?: string;
  lastActive?: string;
};

const PROFILE_VIEW_HEADER_HEIGHT = '4.3125rem';
const PROFILE_VIEW_STYLE = {
  '--profile-view-header-height': PROFILE_VIEW_HEADER_HEIGHT,
} as CSSProperties;
export const PROFILE_OVERLAY_TEXT_STYLE = {
  textShadow: [
    '1px 0 0 #000',
    '-1px 0 0 #000',
    '0 1px 0 #000',
    '0 -1px 0 #000',
    '1px 1px 0 #000',
    '-1px 1px 0 #000',
    '1px -1px 0 #000',
    '-1px -1px 0 #000',
    '0 2px 3px rgba(0, 0, 0, 0.55)',
  ].join(', '),
};

const PROFILE_VIEW_GALLERY_FRAME_STYLE = {
  width: 'min(100%, 30rem)',
} as const;

export type ProfileViewModel = {
  id: string;
  name: string;
  age: number | null;
  pronouns: string;
  distance: string | null;
  lastActive: string | null;
  photos: string[];
  photoMetadata: NonNullable<ProfileRecord['photo_metadata']>;
  photoRelationship?: ProfileRecord['photo_relationship'];
  badges: ProfileRecord['badges'];
  attendingLaunchParty: boolean;
  /** Reading from a travel pin rather than a live location. */
  travelling: boolean;
  travelLabel: string;
  bio: string;
  tags: string[];
  signal: string;
  identities: string[];
  presentation: string[];
  sexuality: string[];
  zodiac: string[];
  ethnicity: string | null;
  bodyType: string | null;
  height: string | null;
  weight: string | null;
  isTrans: boolean | null;
  crowds: string[];
  position: string[];
  role: string[];
  lookingFor: string[];
  availability: string[];
  timing: string | null;
  hosting: string[];
  preferredSpots: string[];
  vibes: string[];
  kinks: string[];
  hobbies: string[];
  protection: string[];
  protections: string[];
  hivStatus: string | null;
  covidStatus: string | null;
  mpoxStatus: string | null;
  healthPreferences: string[];
  birthControl: string[];
  substanceBoundaries: string | null;
  substanceBoundariesList: string[];
  relationshipStatus: string[];
  relationship: ProfileRecord['viewer_relationship'] | null;
};

function deriveAge(yearOfBirth: number | null) {
  return yearOfBirth ? new Date().getFullYear() - yearOfBirth : null;
}

function formatJoined(values: string[]) {
  return values.length ? values.join(', ') : null;
}

function formatSingle(values: string[]) {
  return values.find((value) => value.trim()) ?? null;
}

function canonicalIdentityLabel(identity: string) {
  const match = IDENTITIES.find((option) => option.toLowerCase() === identity.trim().toLowerCase());

  return match ?? identity;
}

function profileIdentityItems(profileView: Pick<ProfileViewModel, 'identities'>) {
  return profileView.identities.map(canonicalIdentityLabel);
}

function removeViewerCruush(profile: ProfileRecord, mutualRevoked: boolean): ProfileRecord {
  const relationship = profile.viewer_relationship;

  return {
    ...profile,
    viewer_relationship: {
      match_id: mutualRevoked ? null : relationship?.match_id ?? null,
      mutual_cruush: mutualRevoked ? false : relationship?.mutual_cruush ?? false,
      outgoing_cruush: false,
      can_message: mutualRevoked ? false : relationship?.can_message ?? false,
      can_reveal_precise_location: mutualRevoked ? false : relationship?.can_reveal_precise_location ?? false,
      location_mode: relationship?.location_mode,
      dark_room_distance_label: relationship?.dark_room_distance_label,
    },
  };
}

export function profileRecordToProfileView(
  profile: ProfileRecord,
  previewState: ProfileLocationState | null = null,
): ProfileViewModel {
  return {
    id: profile.id,
    name: profile.display_name || 'cruush user',
    age: deriveAge(profile.year_of_birth),
    pronouns: formatJoined(profile.pronouns) ?? 'Ask me',
    // The map hands these over in route state; everywhere else the profile
    // itself carries them, so the line reads the same from a deep link, a
    // search result, or a Pink Book post.
    distance: previewState?.distance ?? profile.distance_label ?? null,
    lastActive: previewState?.lastActive ?? profile.last_active ?? null,
    photos: profile.photos,
    photoMetadata: profile.photo_metadata ?? profile.photos.map((photo) => ({ url: photo, explicit: false })),
    photoRelationship: profile.photo_relationship,
    badges: profile.badges ?? [],
    attendingLaunchParty: profile.attendingLaunchParty === true,
    travelling: profile.travelling === true,
    travelLabel: typeof profile.travelLabel === 'string' ? profile.travelLabel : '',
    bio: profile.bio,
    tags: profile.tags ?? [],
    signal: profile.signal ?? '',
    identities: profile.identities,
    presentation: profile.presentation,
    sexuality: profile.sexuality,
    zodiac: profile.zodiac,
    ethnicity: profile.ethnicity || null,
    bodyType: formatJoined(profile.body_type),
    height: profile.height || null,
    weight: profile.weight || null,
    isTrans: profile.is_trans,
    crowds: profile.crowds,
    position: profile.position,
    role: profile.role,
    lookingFor: profile.looking_for,
    availability: profile.availability,
    timing: formatJoined(profile.availability),
    hosting: profile.hosting_travel,
    preferredSpots: profile.preferred_spots,
    vibes: [...new Set([...profile.vibes, ...profile.scenes, ...profile.archetypes])],
    kinks: profile.kinks,
    hobbies: profile.hobbies,
    protection: profile.protection_boundaries.filter(Boolean),
    protections: profile.protections ?? [],
    hivStatus: formatSingle(profile.hiv_status),
    covidStatus: formatSingle(profile.covid_vaccine),
    mpoxStatus: formatSingle(profile.mpox_vaccine),
    healthPreferences: profile.health_preferences ?? [],
    birthControl: profile.birth_control ?? [],
    substanceBoundaries: formatJoined(profile.substance_boundaries),
    substanceBoundariesList: profile.substance_boundaries.filter(Boolean),
    relationshipStatus: profile.relationship_status ?? [],
    relationship: profile.viewer_relationship ?? null,
  };
}

export default function ProfileView() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const location = useLocation();
  const distancePreferences = useDistancePreferences();
  const isOwnProfile = !userId;
  const previewState = (location.state as ProfileLocationState | null) ?? null;
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [revokingCruush, setRevokingCruush] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('basics');
  const dlModeActive = useDlMode();
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [pinTokenValid, setPinTokenValid] = useState(false);

  useEffect(() => {
    if (!expandedPhoto) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedPhoto(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedPhoto]);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      setCruushed(false);
      setCruushBecameMutual(false);

      try {
        const data = isOwnProfile
          ? await getMyProfile()
          : await getProfileById(userId);

        if (!active) {
          return;
        }

        setProfile({
          ...emptyProfilePayload,
          ...data,
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        if (loadError instanceof ProfileApiError && loadError.status === 404) {
          if (!isOwnProfile && userId) {
            // Nothing to show and nothing to tap: the map drops this person
            // and the member lands back where they were.
            notifyProfileUnavailable(userId);
            navigate(-1);
            return;
          }
          setError('Profile not found.');
        } else {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load profile.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [isOwnProfile, userId]);

  useEffect(() => {
    if (!isOwnProfile) {
      return undefined;
    }

    return addProfileChangedListener((savedProfile) => {
      setProfile({
        ...emptyProfilePayload,
        ...savedProfile,
      });
    });
  }, [isOwnProfile]);

  useEffect(() => {
    if (isOwnProfile || !userId) {
      return undefined;
    }

    let active = true;

    const unsubscribe = addCruushChangedListener((payload) => {
      if (payload.targetUserId !== userId) {
        return;
      }

      if (payload.revoked) {
        setCruushed(false);
        setCruushBecameMutual(false);
      } else {
        setCruushed(true);
        setCruushBecameMutual(payload.mutual === true);
      }

      void getProfileById(userId)
        .then((data) => {
          if (!active) {
            return;
          }

          setProfile({
            ...emptyProfilePayload,
            ...data,
          });
        })
        .catch((refreshError) => {
          console.error('Error refreshing profile after cruush:', refreshError);
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isOwnProfile, userId]);

  const profileView = useMemo(() => {
    if (!profile) {
      return null;
    }

    return profileRecordToProfileView(profile, previewState);
  }, [previewState?.distance, previewState?.lastActive, profile]);

  useEffect(() => {
    if (
      isOwnProfile
      || !userId
      || profileView?.relationship?.mutual_cruush !== true
      || profileView.relationship.can_reveal_precise_location !== true
      || profileView.relationship.location_mode === 'STEALTH'
    ) {
      setPinTokenValid(false);
      return undefined;
    }

    let active = true;
    void getMutualCruushMap()
      .then((items) => {
        if (!active) return;
        const target = items.find((item) => item.user.id === userId);
        setPinTokenValid(Boolean(
          target
          && target.canRevealPreciseLocation === true
          && target.coordinates?.precision === 'precise'
          && (target.displayExpiresAtMs == null || target.displayExpiresAtMs > Date.now()),
        ));
      })
      .catch(() => {
        if (active) setPinTokenValid(false);
      });

    return () => {
      active = false;
    };
  }, [
    isOwnProfile,
    profileView?.relationship?.can_reveal_precise_location,
    profileView?.relationship?.location_mode,
    profileView?.relationship?.mutual_cruush,
    userId,
  ]);

  const isAlreadyMutual = cruushBecameMutual || profileView?.relationship?.mutual_cruush === true;
  const hasSentCruush = !isAlreadyMutual && (cruushed || profileView?.relationship?.outgoing_cruush === true);
  const canMessage = profileView?.relationship?.can_message !== false;
  const hasRevocableCruush = isAlreadyMutual || hasSentCruush;
  const canCenterPin = profileView?.relationship?.can_reveal_precise_location === true;
  const targetInDarkRoom = profileView?.relationship?.location_mode === 'STEALTH';
  const pinActionable = !isOwnProfile && isAlreadyMutual && canCenterPin && !targetInDarkRoom && pinTokenValid;
  const displayedDistance = targetInDarkRoom && profileView?.relationship?.dark_room_distance_label
    ? 'Dark Room'
    : profileView?.distance;
  const cruushDisabled = sendingCruush || revokingCruush;
  const heartTheme = isOwnProfile ? 'current' : isAlreadyMutual ? 'mutual' : 'nearby';

  const handleCruush = async () => {
    if (!userId || !profileView) {
      return;
    }

    if (sendingCruush || revokingCruush || hasSentCruush || isAlreadyMutual) {
      return;
    }

    setSendingCruush(true);
    try {
      const data = await sendCruush(userId, {
        name: profileView.name,
        pronouns: profileView.pronouns,
        photo: profileView.photos[0] ?? null,
      });
      setCruushed(true);
      setCruushBecameMutual(data.mutual === true);
      handleCruushSendSuccess(userId, profileView.name, data);
    } catch (cruushError) {
      console.error('Error sending cruush:', cruushError);
      notifyCruushSendError(cruushError);
    } finally {
      setSendingCruush(false);
    }
  };

  const handleRevokeCruush = async () => {
    if (!userId || !profileView || !hasRevocableCruush || sendingCruush || revokingCruush) {
      return;
    }

    const mutual = isAlreadyMutual;
    setRevokingCruush(true);
    try {
      if (mutual) {
        await revokeMutualCruush(userId);
      } else {
        await revokeSentCruush(userId);
      }
      setCruushed(false);
      setCruushBecameMutual(false);
      setProfile((currentProfile) => currentProfile ? removeViewerCruush(currentProfile, mutual) : currentProfile);
      if (mutual) {
        handleMutualCruushRevokeSuccess(userId, profileView.name);
      } else {
        handleSentCruushRevokeSuccess(userId, profileView.name);
      }
    } catch (cruushError) {
      console.error('Error revoking cruush:', cruushError);
      if (mutual) {
        notifyMutualCruushRevokeError(cruushError);
      } else {
        notifySentCruushRevokeError(cruushError);
      }
    } finally {
      setRevokingCruush(false);
    }
  };

  const handleMessage = async () => {
    if (openingMessage) {
      return;
    }

    if (!userId) {
      navigate('/messages');
      return;
    }

    if (profileView?.relationship && !profileView.relationship.can_message) {
      notifyMutualCruushRequired();
      return;
    }

    setOpeningMessage(true);
    try {
      await openConversationOrInbox(navigate, userId, undefined, 'profile');
    } finally {
      setOpeningMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 p-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl">Profile</h1>
          
            <BugButtonSlot testId="profile-view-bug-button-slot" />
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <LoadingCardSkeletons count={2} label="Loading profile" />
        </div>
      </div>
    );
  }

  if (error || !profileView) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 p-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl">Profile</h1>
          
            <BugButtonSlot testId="profile-view-bug-button-slot" />
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error ?? 'Profile unavailable.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20" style={PROFILE_VIEW_STYLE}>
      <div
        data-testid="profile-gallery-frame"
        className="relative mx-auto max-w-2xl"
        style={PROFILE_VIEW_GALLERY_FRAME_STYLE}
      >
        {/* The page chrome rides on the photo instead of a bar above it, each
            control in its own circle so it stays legible over any picture. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3 pr-3 lg:pr-[calc(4.25rem+env(safe-area-inset-right))]">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2">
            <button
              aria-label="Back"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/55 text-white backdrop-blur-sm"
              data-testid="profile-back"
              onClick={() => navigate(-1)}
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {/* The name is already on the photo below; a second copy beside
                the back button only repeated it. */}
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              aria-label="Send profile in cruush"
              className="h-10 w-10 rounded-full border border-white/12 bg-black/55 text-white backdrop-blur-sm"
              onClick={() => setShareOpen(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            {isOwnProfile ? (
              <Button
                className="h-10 rounded-full border border-white/12 bg-black/55 px-4 text-white backdrop-blur-sm"
                onClick={() => navigate('/profile/edit')}
                variant="ghost"
              >
                Edit Profile
              </Button>
            ) : (
              <>
                {userId ? (
                  <BlockUserAction
                    className="h-10 w-10 rounded-full border border-white/12 bg-black/55 text-white backdrop-blur-sm"
                    displayName={profileView.name}
                    onBlocked={() => {
                      setProfile(null);
                      setError('That profile is unavailable.');
                    }}
                    userId={userId}
                  />
                ) : null}
                {userId ? (
                  <ReportAction
                    className="h-10 w-10 rounded-full border border-white/12 bg-black/55 text-white backdrop-blur-sm"
                    label="Report profile"
                    targetId={userId}
                    targetLabel={profileView.name}
                    targetType="profile"
                  />
                ) : null}
              </>
            )}
            {/* The chrome rides on the photo, and the bug button rides with it
                instead of floating in a corner the row had to leave empty. */}
            <BugButtonSlot className="ml-0" testId="profile-view-bug-button-slot" />
          </div>
        </div>

        <ProfilePhotoGallery
          borderTone={resolveUserBorderTone({ current: isOwnProfile, mileHigh: profileView.travelling, mutual: heartTheme === 'mutual' })}
          fitViewport
          relationship={{ ...profileView.photoRelationship, isMutualCruush: isAlreadyMutual, sharesCrowd: profileView.photoRelationship?.sharesCrowd ?? (!isOwnProfile && profileView.crowds.length > 0) }}
          name={profileView.name}
          onExpandPhoto={setExpandedPhoto}
          photoMetadata={profileView.photoMetadata}
          photos={profileView.photos}
          reportTargetUserId={isOwnProfile ? undefined : userId}
          theme={heartTheme}
          userId={profileView.id}
        />

        <div
          data-testid="profile-photo-overlay"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 pb-4 pt-10 text-white"
        >
          <h1 className="flex min-w-0 items-center overflow-visible pb-1 text-3xl leading-tight sm:text-4xl" style={PROFILE_OVERLAY_TEXT_STYLE}>
            <span className="min-w-0 truncate">{profileView.name}</span>
            {profileView.age ? <span className="shrink-0 whitespace-nowrap pr-1">, {profileView.age}</span> : null}
            {profileView.travelling ? (
              <img
                alt="Mile High Club"
                className="ml-2 h-5 w-5 shrink-0 sm:h-6 sm:w-6"
                src={mileHighClubWhite}
                title={profileView.travelLabel
                  ? `Mile High Club: ${profileView.travelLabel}`
                  : 'Mile High Club'}
              />
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-white" style={PROFILE_OVERLAY_TEXT_STYLE}>{profileView.pronouns}</p>
          {displayedDistance ? (
            <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-sm text-white" style={PROFILE_OVERLAY_TEXT_STYLE}>
              {displayedDistance === 'Dark Room'
                ? <DarkRoomMark active className="h-4 w-4 shrink-0" />
                : <CruushIcon name="map" className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 truncate">{displayedDistance === 'Dark Room' ? displayedDistance : formatDistanceWithAway(displayedDistance, distancePreferences.mode)}</span>
              {profileView.lastActive ? <span className="shrink-0">• {profileView.lastActive}</span> : null}
            </div>
          ) : null}

          {/* The signal is the line that sells the profile, so it reads at full
              width on the photo rather than in a card under it. */}
          {profileView.signal ? (
            <p
              className="mt-2 truncate text-base leading-snug text-white sm:text-lg"
              data-testid="profile-overlay-signal"
              style={PROFILE_OVERLAY_TEXT_STYLE}
            >
              {profileView.signal}
            </p>
          ) : null}

          {profileView.vibes.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="profile-overlay-vibes">
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
          {/* The controls ride on the photo itself rather than under it. */}
          {!isOwnProfile ? (
            <div className="pointer-events-auto mt-3">
            <div className="flex gap-2">
              <Button
                className={`cruush-action-sheen flex-1 rounded-xl border disabled:opacity-100 ${hasRevocableCruush
                  ? 'border-transparent text-white'
                  : cruushDisabled
                    ? 'border-white/25 text-white/55'
                    : 'border-transparent text-white'}`}
                onClick={() => {
                  void (hasRevocableCruush ? handleRevokeCruush() : handleCruush());
                }}
                disabled={cruushDisabled}
                aria-label={revokingCruush ? (isAlreadyMutual ? 'removing mutual' : 'unsending cruush') : isAlreadyMutual ? 'remove mutual' : hasSentCruush ? 'unsend cruush' : sendingCruush ? 'sending cruush' : 'send cruush'}
                style={{
                  background: cruushDisabled
                    ? '#151021'
                    : hasRevocableCruush
                      ? 'var(--cruush-gradient-soft-28), #0A0A12'
                      : 'var(--cruush-gradient)',
                }}
              >
                <CruushIcon name="mutual" className={`mr-2 h-4 w-4 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant="white" />
                {revokingCruush ? (isAlreadyMutual ? 'removing...' : 'unsending...') : isAlreadyMutual ? 'remove mutual' : hasSentCruush ? 'unsend' : sendingCruush ? 'sending...' : 'cruush'}
              </Button>
              {!isOwnProfile ? (
                <Button
                  type="button"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl border-0 text-white transition hover:brightness-110"
                  style={{ background: pinActionable ? 'var(--cruush-gradient)' : 'var(--cruush-gradient-soft-28), #0A0A12' }}
                  aria-label={pinActionable ? `Center the map on ${profileView.name}` : `${profileView.name} does not share a precise location with you`}
                  title={pinActionable ? `Center the map on ${profileView.name}` : targetInDarkRoom ? 'Dark Room' : 'Precise location unavailable'}
                  onClick={pinActionable ? () => navigate(`/map?mode=mutuals&focusUserId=${encodeURIComponent(profileView.id)}`) : undefined}
                  disabled={!pinActionable}
                >
                  <CruushIconImage src={mapIconWhite} className={`h-7 w-7 ${pinActionable ? '' : 'opacity-45'}`} />
                </Button>
              ) : null}
              <Button
                className={`cruush-action-sheen flex-1 rounded-xl border border-[#6F00FF] disabled:opacity-100 ${canMessage ? 'text-white' : 'text-white/55'}`}
                style={{ background: canMessage ? 'var(--cruush-gradient)' : '#151021' }}
                onClick={() => {
                  void handleMessage();
                }}
                disabled={openingMessage || !canMessage}
                aria-label={canMessage ? 'Message' : 'Mutuals only'}
              >
                <CruushIcon name="send" className="mr-2 h-4 w-4" variant="white" />
                {!canMessage ? 'Mutuals only' : openingMessage ? 'Opening...' : 'Message'}
              </Button>
            </div>
            </div>
          ) : null}
        </div>
      </div>

      {expandedPhoto && !shouldMaskPhoto(dlModeActive, profileView.photoMetadata.find((photo) => photo.url === expandedPhoto)?.explicit, { ...profileView.photoRelationship, isMutualCruush: isAlreadyMutual, sharesCrowd: profileView.photoRelationship?.sharesCrowd ?? (!isOwnProfile && profileView.crowds.length > 0) }) ? (
        <div
          aria-label="Profile photo"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black"
          data-testid="profile-photo-viewer"
          onClick={() => setExpandedPhoto(null)}
          role="dialog"
        >
          <img
            alt={profileView.name}
            className="max-h-full max-w-full object-contain"
            src={resolveMediaUrl(expandedPhoto)}
          />

          {/* A way out, and a way to report what you are looking at. */}
          <div
            className="absolute right-[calc(4rem+env(safe-area-inset-right))] top-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-2"
            data-testid="profile-photo-viewer-actions"
            onClick={(event) => event.stopPropagation()}
          >
            {isOwnProfile ? null : (
              <div className="rounded-full border border-white/12 bg-black/55 backdrop-blur-sm">
                <ReportAction
                  label="Report this profile photo"
                  targetId={expandedPhoto}
                  targetLabel={`a photo from ${profileView.name}`}
                  targetType="profile_photo"
                  targetUserId={userId}
                />
              </div>
            )}
            <button
              aria-label="Close photo"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/55 text-white backdrop-blur-sm"
              data-testid="profile-photo-viewer-close"
              onClick={() => setExpandedPhoto(null)}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
      <InAppShareDialog open={shareOpen} onOpenChange={setShareOpen} share={{ kind: 'profile', id: profileView.id, label: profileView.name }} />

      <div className="mx-auto max-w-2xl px-4 pb-5 pt-2 sm:px-6 sm:pb-6 sm:pt-2">
        <div className="space-y-3">
          {profileView.attendingLaunchParty || (profileView.badges?.length ?? 0) > 0 ? (
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-4xl">
                {profileView.attendingLaunchParty ? (
                  <button
                    type="button"
                    className="ml-3 inline-flex h-8 w-8 translate-y-1 items-center justify-center border-0 bg-transparent p-0 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#03ecfc]/65"
                    aria-label="Center map on launch party"
                    title="Center map on launch party"
                    onClick={() => navigate('/map', {
                      state: {
                        centerEventSlug: 'the-chocolate-factory-launch',
                      },
                    })}
                  >
                    <img alt="" aria-hidden="true" className="h-5 w-5 drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]" src={partyHatIcon} />
                  </button>
                ) : null}
              </div>
              <CruushBadge badges={profileView.badges} />
            </div>

          </div>
          ) : null}

          <ProfileDetailsTabs
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            profileView={profileView}
          />
        </div>
      </div>
    </div>
  );
}

export function ProfileDetailsTabs({
  activeTab,
  onActiveTabChange,
  profileView,
  compact = false,
}: {
  activeTab: string;
  onActiveTabChange: (value: string) => void;
  profileView: ProfileViewModel;
  compact?: boolean;
}) {
  const tabTriggerClassName = compact ? 'min-h-9' : 'min-h-11';

  return (
    <Tabs value={activeTab} onValueChange={onActiveTabChange} className="w-full">
      <TabsList className={`grid h-auto w-full grid-cols-3 rounded-full border border-white/10 bg-background/92 p-1 backdrop-blur-md ${compact ? 'text-xs' : ''}`}>
        <TabsTrigger value="basics" className={tabTriggerClassName} onClick={() => onActiveTabChange('basics')}>Basics</TabsTrigger>
        <TabsTrigger value="intimacy" className={tabTriggerClassName} onClick={() => onActiveTabChange('intimacy')}>Intimacy</TabsTrigger>
        <TabsTrigger value="health" className={tabTriggerClassName} onClick={() => onActiveTabChange('health')}>Health</TabsTrigger>
      </TabsList>

      {/* The signal and the vibe capsules both ride the photo above these tabs,
          so repeating them here only pushed the rest of the profile down. */}
      <TabsContent value="basics" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        {profileView.bio ? (
          <Section title="About" compact={compact}>
            <p className="text-muted-foreground">{profileView.bio}</p>
          </Section>
        ) : null}

        {profileView.tags.length > 0 ? (
          <Section title="Tags" compact={compact}>
            <BadgeList items={profileView.tags.map((tag) => `#${tag}`)} compact={compact} />
          </Section>
        ) : null}

        <Section title="Gender Identity" compact={compact}>
          <BadgeList items={profileIdentityItems(profileView)} compact={compact} />
        </Section>

        <Section title="Presentation" compact={compact}>
          <BadgeList items={profileView.presentation} compact={compact} />
        </Section>

        <Section title="Sexuality" compact={compact}>
          <BadgeList items={profileView.sexuality} compact={compact} />
        </Section>

        <Section title="Zodiac" compact={compact}>
          <BadgeList items={profileView.zodiac} compact={compact} />
        </Section>

        <Section title="Stats" compact={compact}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailItem label="Ethnicity" value={profileView.ethnicity} compact={compact} />
            <DetailItem label="Body" value={profileView.bodyType} compact={compact} />
            <DetailItem label="Height" value={profileView.height} compact={compact} />
            <DetailItem label="Weight" value={profileView.weight} compact={compact} />
          </div>
        </Section>

        <Section title="Hobbies" compact={compact}>
          <BadgeList items={profileView.hobbies} compact={compact} />
        </Section>
      </TabsContent>

      <TabsContent value="intimacy" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:order-4">
          {/* The editor has taken this under Intimacy for a while and the
              profile never showed it back. */}
          {profileView.relationshipStatus.length > 0 ? (
            <Section title="Relationship status" compact={compact} className="!order-3">
              <BadgeList items={profileView.relationshipStatus} compact={compact} />
            </Section>
          ) : null}

          <Section title="Role" compact={compact} className="!order-1">
            <BadgeList items={profileView.role} compact={compact} />
          </Section>

          <Section title="Position" compact={compact} className="!order-2">
            <BadgeList items={profileView.position} compact={compact} />
          </Section>

          <Section title="Looking For" compact={compact}>
            <BadgeList items={profileView.lookingFor} compact={compact} />
            {profileView.timing ? (
              <div className="mt-2 text-sm text-muted-foreground">
                Availability: <span className="text-foreground">{profileView.timing}</span>
              </div>
            ) : null}
          </Section>

          <Section title="Hosting/Travel" compact={compact}>
            <BadgeList items={profileView.hosting} compact={compact} />
          </Section>

          <Section title="Preferred spots" compact={compact}>
            <BadgeList items={profileView.preferredSpots} compact={compact} />
          </Section>

        </div>

        <Section title="Kinks & Fetishes" compact={compact}>
          <BadgeList items={profileView.kinks} compact={compact} />
        </Section>
      </TabsContent>

      <TabsContent value="health" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        <Section title="Protections" compact={compact}>
          <BadgeList items={profileView.protections} compact={compact} />
        </Section>

        <Section title="Protection boundaries" compact={compact}>
          <BadgeList items={profileView.protection} compact={compact} />
        </Section>

        <div className={`space-y-3 rounded-2xl border border-border bg-card/60 ${compact ? 'p-3' : 'p-4'}`}>
          <h2 className={compact ? 'text-base' : 'text-lg'}>HIV Status</h2>
          <BadgeList items={profileView.hivStatus ? [profileView.hivStatus] : []} compact={compact} />
        </div>

        {/* Protection boundaries had its own card above and a second copy in
            here reading the same field, so editing it looked like only one of
            them moved. One field, one place. */}
        <Section title="Substance boundaries" compact={compact}>
          <BadgeList items={profileView.substanceBoundariesList} compact={compact} />
        </Section>
      </TabsContent>
    </Tabs>
  );
}

function Section({ title, children, compact = false, className = '' }: { title: string; children: ReactNode; compact?: boolean; className?: string }) {
  return (
    <section className={`space-y-3 rounded-2xl border border-border bg-card/60 ${compact ? 'p-3' : 'p-4'} ${className}`}>
      <h2 className={compact ? 'text-base' : 'text-lg'}>{title}</h2>
      {children}
    </section>
  );
}

function BadgeList({
  items,
  variant = 'default',
  compact = false,
}: {
  items: string[];
  variant?: 'default' | 'gradient';
  compact?: boolean;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nothing listed yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
                <span
                  key={item}
                  className={`rounded-full border ${compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1 text-sm'}`}
                  style={variant === 'gradient'
            ? {
                borderColor: 'transparent',
                background: 'var(--cruush-gradient-soft-18)',
              }
            : undefined}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function DetailItem({
  label,
  value,
  compact = false,
  emptyFallback = 'Not shared',
}: {
  label: string;
  value: string | null;
  compact?: boolean;
  emptyFallback?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-background/50 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 min-h-[1.25rem] text-foreground">{value || emptyFallback}</div>
    </div>
  );
}
