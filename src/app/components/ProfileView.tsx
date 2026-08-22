import { IDENTITIES } from '../lib/profileOptions';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { resolveMediaUrl } from '../lib/apiClient';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import { resolveVibeTone, vibeCapsuleStyle } from '../lib/vibeTone';
import ProfilePhotoGallery from './ProfilePhotoGallery';
import { revokeMutualCruush, revokeSentCruush, sendCruush } from '../lib/cruushApi';
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
import { formatDistanceLabel, useDistancePreferences } from '../lib/distancePreferences';
import partyHatIcon from '../assets/ui-icons/party-hat.svg';

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
  width: `min(100%, calc((100dvh - var(--profile-view-header-height, ${PROFILE_VIEW_HEADER_HEIGHT}) - 1px) * 0.8))`,
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
  badges: ProfileRecord['badges'];
  attendingLaunchParty: boolean;
  bio: string;
  signal: string;
  identities: string[];
  presentation: string[];
  sexuality: string[];
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
  vibes: string[];
  kinks: string[];
  hobbies: string[];
  protection: string[];
  hivStatus: string | null;
  covidStatus: string | null;
  mpoxStatus: string | null;
  healthPreferences: string[];
  birthControl: string[];
  substanceBoundaries: string | null;
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
    distance: previewState?.distance ?? null,
    lastActive: previewState?.lastActive ?? null,
    photos: profile.photos,
    photoMetadata: profile.photo_metadata ?? profile.photos.map((photo) => ({ url: photo, explicit: false })),
    badges: profile.badges ?? [],
    attendingLaunchParty: profile.attendingLaunchParty === true,
    bio: profile.bio,
    signal: profile.signal ?? '',
    identities: profile.identities,
    presentation: profile.presentation,
    sexuality: profile.sexuality,
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
    vibes: [...new Set([...profile.vibes, ...profile.scenes, ...profile.archetypes])],
    kinks: profile.kinks,
    hobbies: profile.hobbies,
    protection: [...profile.condoms, ...profile.prep, ...profile.doxypep].filter(Boolean),
    hivStatus: formatSingle(profile.hiv_status),
    covidStatus: formatSingle(profile.covid_vaccine),
    mpoxStatus: formatSingle(profile.mpox_vaccine),
    healthPreferences: profile.health_preferences ?? [],
    birthControl: profile.birth_control ?? [],
    substanceBoundaries: formatJoined(profile.substance_boundaries),
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
  const [activeTab, setActiveTab] = useState('basics');
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

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
          setError(isOwnProfile ? 'Profile not found.' : 'That profile is unavailable.');
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

  const isAlreadyMutual = cruushBecameMutual || profileView?.relationship?.mutual_cruush === true;
  const hasSentCruush = !isAlreadyMutual && (cruushed || profileView?.relationship?.outgoing_cruush === true);
  const canMessage = profileView?.relationship?.can_message !== false;
  const hasRevocableCruush = isAlreadyMutual || hasSentCruush;
  const canCenterPin = profileView?.relationship?.can_reveal_precise_location === true;
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
      await openConversationOrInbox(navigate, userId);
    } finally {
      setOpeningMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 p-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-4 py-8 text-sm text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (error || !profileView) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 p-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
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
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            {isOwnProfile ? (
              <Button variant="outline" onClick={() => navigate('/profile/edit')}>
                Edit Profile
              </Button>
            ) : (
              <>
                {userId ? (
                  <BlockUserAction
                    userId={userId}
                    displayName={profileView.name}
                    onBlocked={() => {
                      setProfile(null);
                      setError('That profile is unavailable.');
                    }}
                  />
                ) : null}
                {userId ? (
                  <ReportAction
                    targetType="profile"
                    targetId={userId}
                    targetLabel={profileView.name}
                    label="Report profile"
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      <div
        data-testid="profile-gallery-frame"
        className="relative mx-auto max-w-2xl"
        style={PROFILE_VIEW_GALLERY_FRAME_STYLE}
      >
        <ProfilePhotoGallery
          fitViewport
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
          <h1 className="truncate text-3xl sm:text-4xl" style={PROFILE_OVERLAY_TEXT_STYLE}>
            {profileView.name}
            {profileView.age ? <span>, {profileView.age}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-white" style={PROFILE_OVERLAY_TEXT_STYLE}>{profileView.pronouns}</p>
          {profileView.distance ? (
            <div className="mt-1 flex items-center gap-2 text-sm text-white" style={PROFILE_OVERLAY_TEXT_STYLE}>
              <CruushIcon name="map" className="h-4 w-4" />
              <span>{formatDistanceLabel(profileView.distance, distancePreferences.mode)} away</span>
              {profileView.lastActive ? <span>• {profileView.lastActive}</span> : null}
            </div>
          ) : null}

          {/* The signal is the line that sells the profile, so it reads at full
              width on the photo rather than in a card under it. */}
          {profileView.signal ? (
            <p
              className="mt-2 line-clamp-2 text-base leading-snug text-white sm:text-lg"
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
                <CruushIcon name="safety" className={`mr-2 h-4 w-4 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant="white" />
                {revokingCruush ? (isAlreadyMutual ? 'removing...' : 'unsending...') : isAlreadyMutual ? 'remove mutual' : hasSentCruush ? 'unsend' : sendingCruush ? 'sending...' : 'cruush'}
              </Button>
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
              {canCenterPin ? (
                <Button
                  type="button"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl border-0 text-white transition hover:brightness-110"
                  style={{ background: 'var(--cruush-gradient)' }}
                  aria-label={`Center the map on ${profileView.name}`}
                  title={`Center the map on ${profileView.name}`}
                  onClick={() => navigate('/map', { state: { focusUserId: profileView.id } })}
                >
                  <CruushIconImage src={mapIconWhite} className="h-5 w-5" />
                </Button>
              ) : null}
            </div>
            </div>
          ) : null}
        </div>
      </div>

      {expandedPhoto ? (
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
            className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-2"
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

      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6">
        <div className="space-y-5">
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
      <TabsList className={`grid h-auto w-full grid-cols-3 rounded-full border border-white/10 bg-background/25 p-1 ${compact ? 'text-xs' : ''}`}>
        <TabsTrigger value="basics" className={tabTriggerClassName} onClick={() => onActiveTabChange('basics')}>Basics</TabsTrigger>
        <TabsTrigger value="intimacy" className={tabTriggerClassName} onClick={() => onActiveTabChange('intimacy')}>Intimacy</TabsTrigger>
        <TabsTrigger value="health" className={tabTriggerClassName} onClick={() => onActiveTabChange('health')}>Health</TabsTrigger>
      </TabsList>

      <TabsContent value="basics" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        {compact && profileView.signal ? (
          <Section title="Signal" compact={compact}>
            <p className="text-muted-foreground">{profileView.signal}</p>
          </Section>
        ) : null}

        {profileView.bio ? (
          <Section title="About" compact={compact}>
            <p className="text-muted-foreground">{profileView.bio}</p>
          </Section>
        ) : null}

        <Section title="Identities" compact={compact}>
          <BadgeList items={profileIdentityItems(profileView)} compact={compact} />
        </Section>

        <Section title="Presentation" compact={compact}>
          <BadgeList items={profileView.presentation} compact={compact} />
        </Section>

        <Section title="Sexuality" compact={compact}>
          <BadgeList items={profileView.sexuality} compact={compact} />
        </Section>

        {profileView.crowds.length > 0 ? (
          <Section title="Crowds" compact={compact}>
            <BadgeList items={profileView.crowds} compact={compact} />
          </Section>
        ) : null}

        <Section title="Stats" compact={compact}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailItem label="Ethnicity" value={profileView.ethnicity} compact={compact} />
            <DetailItem label="Body" value={profileView.bodyType} compact={compact} />
            <DetailItem label="Height" value={profileView.height} compact={compact} />
            <DetailItem label="Weight" value={profileView.weight} compact={compact} />
          </div>
        </Section>

        <Section title="Vibes" compact={compact}>
          <BadgeList items={profileView.vibes} variant="gradient" compact={compact} />
        </Section>

        <Section title="Hobbies" compact={compact}>
          <BadgeList items={profileView.hobbies} compact={compact} />
        </Section>
      </TabsContent>

      <TabsContent value="intimacy" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <Section title="Position" compact={compact}>
            <BadgeList items={profileView.position} compact={compact} />
          </Section>

          <Section title="Role" compact={compact}>
            <BadgeList items={profileView.role} compact={compact} />
          </Section>
        </div>

        <Section title="Kinks & Fetishes" compact={compact}>
          <BadgeList items={profileView.kinks} compact={compact} />
        </Section>
      </TabsContent>

      <TabsContent value="health" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        <Section title="Protection" compact={compact}>
          <BadgeList items={profileView.protection} compact={compact} />
        </Section>

        <Section title="Health" compact={compact}>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <DetailItem label="HIV" value={profileView.hivStatus} compact={compact} emptyFallback="" />
            <DetailItem label="COVID" value={profileView.covidStatus} compact={compact} emptyFallback="" />
            <DetailItem label="Mpox" value={profileView.mpoxStatus} compact={compact} emptyFallback="" />
          </div>
          {profileView.healthPreferences.length > 0 ? (
            <div className="mt-3">
              <p className="mb-2 text-sm text-muted-foreground">Preferences</p>
              <BadgeList items={profileView.healthPreferences} compact={compact} />
            </div>
          ) : null}
        </Section>

        <Section title="Birth control" compact={compact}>
          <BadgeList items={profileView.birthControl} compact={compact} />
        </Section>

        <Section title="Lifestyle" compact={compact}>
          <div className="grid gap-3 text-sm">
            <DetailItem label="Substance Boundaries" value={profileView.substanceBoundaries} compact={compact} />
          </div>
        </Section>
      </TabsContent>
    </Tabs>
  );
}

function Section({ title, children, compact = false }: { title: string; children: ReactNode; compact?: boolean }) {
  return (
    <section className={`space-y-3 rounded-2xl border border-border bg-card/60 ${compact ? 'p-3' : 'p-4'}`}>
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
