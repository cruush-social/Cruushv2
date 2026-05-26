import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Flag, Heart, MapPin, MessageCircle, Share2 } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { sendCruush } from '../lib/cruushApi';
import { emptyProfilePayload, getMyProfile, getProfileById, ProfileApiError, type ProfileRecord } from '../lib/profileApi';
import { openConversationOrInbox } from '../lib/openConversation';
import { PROFILE_HERO_ASPECT_STYLE } from '../lib/photoLayout';

type ProfileLocationState = {
  distance?: string;
  lastActive?: string;
};

function deriveAge(yearOfBirth: number | null) {
  return yearOfBirth ? new Date().getFullYear() - yearOfBirth : null;
}

function formatJoined(values: string[]) {
  return values.length ? values.join(', ') : null;
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
  const [activeTab, setActiveTab] = useState('basics');

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);

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

  const profileView = useMemo(() => {
    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      name: profile.display_name || 'Cruush user',
      age: deriveAge(profile.year_of_birth),
      pronouns: formatJoined(profile.pronouns) ?? 'Ask me',
      distance: previewState?.distance ?? null,
      lastActive: previewState?.lastActive ?? null,
      photos: profile.photos,
      bio: profile.bio,
      identities: profile.identities,
      presentation: profile.presentation,
      sexuality: profile.sexuality,
      ethnicity: profile.ethnicity || null,
      bodyType: formatJoined(profile.body_type),
      height: profile.height || null,
      weight: profile.weight || null,
      position: profile.position,
      role: profile.role,
      lookingFor: profile.looking_for,
      timing: formatJoined(profile.availability),
      hosting: profile.hosting_travel,
      vibes: profile.vibes,
      kinks: profile.kinks,
      hobbies: profile.hobbies,
      protection: [...profile.condoms, ...profile.prep, ...profile.doxypep].filter(Boolean),
      hivStatus: formatJoined(profile.hiv_status),
      mpoxStatus: formatJoined(profile.mpox_vaccine),
      substanceBoundaries: formatJoined(profile.substance_boundaries),
    };
  }, [previewState?.distance, previewState?.lastActive, profile]);

  const handleCruush = async () => {
    if (!userId || !profileView) {
      return;
    }

    try {
      const data = await sendCruush(userId, {
        name: profileView.name,
        pronouns: profileView.pronouns,
        photo: profileView.photos[0] ?? null,
      });
      setCruushed(true);

      if (data.mutual) {
        alert(`It's mutual. You and ${profileView.name} have a cruush on each other.`);
      }
    } catch (cruushError) {
      console.error('Error sending cruush:', cruushError);
    }
  };

  const handleMessage = async () => {
    if (!userId) {
      navigate('/messages');
      return;
    }

    await openConversationOrInbox(navigate, userId);
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
                <Button variant="ghost" size="icon" aria-label="Share profile">
                  <Share2 className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Report profile">
                  <Flag className="w-5 h-5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl">
        <div
          data-testid="profile-hero-media"
          className="relative w-full overflow-hidden"
          style={{ ...PROFILE_HERO_ASPECT_STYLE, background: 'var(--cruush-gradient)' }}
        >
          {profileView.photos.length > 0 ? (
            <img
              src={profileView.photos[0]}
              alt={profileView.name}
              className="h-full w-full object-cover"
              style={PROFILE_HERO_ASPECT_STYLE}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Heart className="w-32 h-32 text-white/20" />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6">
        <div className="space-y-5">
          <div className="space-y-3">
            <div>
              <h1 className="text-4xl mb-2">
                {profileView.name}
                {profileView.age ? <span>, {profileView.age}</span> : null}
              </h1>
              <p className="text-muted-foreground">{profileView.pronouns}</p>
              {profileView.distance ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
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
                  disabled={cruushed}
                  style={{
                    background: cruushed
                      ? '#666'
                      : 'var(--cruush-gradient)',
                  }}
                >
                  <Heart className={`w-4 h-4 mr-2 ${cruushed ? 'fill-current' : ''}`} />
                  {cruushed ? 'cruushed!' : 'cruush'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    void handleMessage();
                  }}
                  style={{
                    borderColor: 'var(--cruush-purple)',
                    color: 'var(--cruush-purple)',
                  }}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Message
                </Button>
              </div>
            ) : null}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl border border-border bg-card p-1">
              <TabsTrigger value="basics" className="min-h-11" onClick={() => setActiveTab('basics')}>Basics</TabsTrigger>
              <TabsTrigger value="intimacy" className="min-h-11" onClick={() => setActiveTab('intimacy')}>Intimacy</TabsTrigger>
              <TabsTrigger value="health" className="min-h-11" onClick={() => setActiveTab('health')}>Health</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="mt-5 space-y-5">
              {profileView.bio ? (
                <Section title="About">
                  <p className="text-muted-foreground">{profileView.bio}</p>
                </Section>
              ) : null}

              <Section title="Identities">
                <BadgeList items={profileView.identities} />
              </Section>

              <Section title="Presentation">
                <BadgeList items={profileView.presentation} />
              </Section>

              <Section title="Sexuality">
                <BadgeList items={profileView.sexuality} />
              </Section>

              <Section title="Stats">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="Ethnicity" value={profileView.ethnicity} />
                  <DetailItem label="Body" value={profileView.bodyType} />
                  <DetailItem label="Height" value={profileView.height} />
                  <DetailItem label="Weight" value={profileView.weight} />
                </div>
              </Section>

              <Section title="Hobbies">
                <BadgeList items={profileView.hobbies} />
              </Section>
            </TabsContent>

            <TabsContent value="intimacy" className="mt-5 space-y-5">
              <Section title="Looking For">
                <BadgeList items={profileView.lookingFor} />
                {profileView.timing ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Timing: <span className="text-foreground">{profileView.timing}</span>
                  </div>
                ) : null}
              </Section>

              <Section title="Availability">
                <BadgeList items={profile.availability} />
              </Section>

              <Section title="Hosting/Travel">
                <BadgeList items={profileView.hosting} />
              </Section>

              <Section title="Position">
                <BadgeList items={profileView.position} />
              </Section>

              <Section title="Role">
                <BadgeList items={profileView.role} />
              </Section>

              <Section title="Kinks & Fetishes">
                <BadgeList items={profileView.kinks} />
              </Section>

              <Section title="Vibes">
                <BadgeList items={profileView.vibes} variant="gradient" />
              </Section>
            </TabsContent>

            <TabsContent value="health" className="mt-5 space-y-5">
              <Section title="Protection">
                <BadgeList items={profileView.protection} />
              </Section>

              <Section title="Health">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="HIV" value={profileView.hivStatus} />
                  <DetailItem label="Mpox" value={profileView.mpoxStatus} />
                </div>
              </Section>

              <Section title="Lifestyle">
                <div className="grid gap-3 text-sm">
                  <DetailItem label="Substance Boundaries" value={profileView.substanceBoundaries} />
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

function BadgeList({ items, variant = 'default' }: { items: string[]; variant?: 'default' | 'gradient' }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nothing listed yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
                <span
                  key={item}
                  className="rounded-full border px-3 py-1 text-sm"
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

function DetailItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground">{value || 'Not shared'}</div>
    </div>
  );
}
