import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import BlockUserAction from './BlockUserAction';
import ReportAction from './ReportAction';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import ProfilePhotoGallery from './ProfilePhotoGallery';
import { sendCruush } from '../lib/cruushApi';
import { addCruushChangedListener } from '../lib/cruushEvents';
import { handleCruushSendSuccess, notifyCruushSendError, notifyMutualCruushRequired } from '../lib/cruushNotifications';
import { emptyProfilePayload, getMyProfile, getProfileById, ProfileApiError, type ProfileRecord } from '../lib/profileApi';
import { openConversationOrInbox } from '../lib/openConversation';

type ProfileLocationState = {
  distance?: string;
  lastActive?: string;
};

export type ProfileViewModel = {
  id: string;
  name: string;
  age: number | null;
  pronouns: string;
  distance: string | null;
  lastActive: string | null;
  photos: string[];
  badges: ProfileRecord['badges'];
  bio: string;
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
  mpoxStatus: string | null;
  substanceBoundaries: string | null;
  relationship: ProfileRecord['viewer_relationship'] | null;
};

function deriveAge(yearOfBirth: number | null) {
  return yearOfBirth ? new Date().getFullYear() - yearOfBirth : null;
}

function formatJoined(values: string[]) {
  return values.length ? values.join(', ') : null;
}

function profileIdentityItems(profileView: Pick<ProfileViewModel, 'identities' | 'isTrans'>) {
  const nonTransIdentities = profileView.identities.filter((item) => item.trim().toLowerCase() !== 'trans');

  return profileView.isTrans === true
    ? [...nonTransIdentities, 'trans']
    : nonTransIdentities;
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
    badges: profile.badges ?? [],
    bio: profile.bio,
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
    hivStatus: formatJoined(profile.hiv_status),
    mpoxStatus: formatJoined(profile.mpox_vaccine),
    substanceBoundaries: formatJoined(profile.substance_boundaries),
    relationship: profile.viewer_relationship ?? null,
  };
}

export default function ProfileView() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOwnProfile = !userId;
  const previewState = (location.state as ProfileLocationState | null) ?? null;
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [activeTab, setActiveTab] = useState('basics');

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
    if (isOwnProfile || !userId) {
      return undefined;
    }

    let active = true;

    const unsubscribe = addCruushChangedListener((payload) => {
      if (payload.targetUserId !== userId) {
        return;
      }

      setCruushed(true);

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
  const hasSentCruush = cruushed || profileView?.relationship?.outgoing_cruush === true;
  const cruushDisabled = sendingCruush || hasSentCruush || isAlreadyMutual;

  const handleCruush = async () => {
    if (!userId || !profileView) {
      return;
    }

    if (sendingCruush || hasSentCruush || isAlreadyMutual) {
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
    <div className="min-h-screen bg-background pb-20">
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

      <div className="mx-auto max-w-2xl">
        <ProfilePhotoGallery
          name={profileView.name}
          photos={profileView.photos}
          reportTargetUserId={isOwnProfile ? undefined : userId}
        />
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6">
        <div className="space-y-5">
          <div className="space-y-3">
            <div>
              <h1 className="text-4xl mb-2">
                {profileView.name}
                {profileView.age ? <span>, {profileView.age}</span> : null}
              </h1>
              <CruushBadge badges={profileView.badges} />
              <p className="text-muted-foreground">{profileView.pronouns}</p>
              {profileView.distance ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <CruushIcon name="map" className="h-4 w-4 opacity-70" />
                  <span>{profileView.distance} away</span>
                  {profileView.lastActive ? <span>• {profileView.lastActive}</span> : null}
                </div>
              ) : null}
            </div>

            {!isOwnProfile ? (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    void handleCruush();
                  }}
                  disabled={cruushDisabled}
                  aria-label={isAlreadyMutual ? 'Mutual cruush' : hasSentCruush ? 'Cruush sent' : sendingCruush ? 'Sending cruush' : 'Send cruush'}
                  style={{
                    background: cruushDisabled
                      ? '#666'
                      : 'var(--cruush-gradient)',
                  }}
                >
                  <CruushIcon name="cruush" className={`mr-2 h-4 w-4 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant={cruushDisabled ? 'white' : 'colored'} />
                  {isAlreadyMutual ? 'mutual cruush' : hasSentCruush ? 'sent' : sendingCruush ? 'sending...' : 'cruush'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    void handleMessage();
                  }}
                  disabled={openingMessage || Boolean(profileView.relationship && !profileView.relationship.can_message)}
                  style={{
                    borderColor: 'var(--cruush-purple)',
                    color: 'var(--cruush-purple)',
                  }}
                >
                  <CruushIcon name="send" className="mr-2 h-4 w-4" variant="colored" />
                  {openingMessage ? 'Opening...' : 'Message'}
                </Button>
              </div>
            ) : null}
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

        <Section title="Hobbies" compact={compact}>
          <BadgeList items={profileView.hobbies} compact={compact} />
        </Section>
      </TabsContent>

      <TabsContent value="intimacy" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        <Section title="Looking For" compact={compact}>
          <BadgeList items={profileView.lookingFor} compact={compact} />
          {profileView.timing ? (
            <div className="mt-2 text-sm text-muted-foreground">
              Timing: <span className="text-foreground">{profileView.timing}</span>
            </div>
          ) : null}
        </Section>

        <Section title="Availability" compact={compact}>
          <BadgeList items={profileView.availability} compact={compact} />
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

        <Section title="Kinks & Fetishes" compact={compact}>
          <BadgeList items={profileView.kinks} compact={compact} />
        </Section>

        <Section title="Vibes" compact={compact}>
          <BadgeList items={profileView.vibes} variant="gradient" compact={compact} />
        </Section>
      </TabsContent>

      <TabsContent value="health" className={`${compact ? 'mt-4 space-y-4' : 'mt-5 space-y-5'}`}>
        <Section title="Protection" compact={compact}>
          <BadgeList items={profileView.protection} compact={compact} />
        </Section>

        <Section title="Health" compact={compact}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailItem label="HIV" value={profileView.hivStatus} compact={compact} />
            <DetailItem label="Mpox" value={profileView.mpoxStatus} compact={compact} />
          </div>
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

function DetailItem({ label, value, compact = false }: { label: string; value: string | null; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-background/50 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground">{value || 'Not shared'}</div>
    </div>
  );
}
