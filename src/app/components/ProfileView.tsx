import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Heart, MessageCircle, Share2, Flag, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { sendCruush } from '../lib/cruushApi';
import { openConversationOrInbox } from '../lib/openConversation';
import { PROFILE_HERO_ASPECT_STYLE } from '../lib/photoLayout';

export default function ProfileView() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const isOwnProfile = !userId;
  const [cruushed, setCruushed] = useState(false);

  const handleCruush = async () => {
    try {
      if (!userId) return;

      const data = await sendCruush(userId, {
        name: mockUser.name,
        pronouns: mockUser.pronouns,
        photo: mockUser.photos[0] ?? null,
      });
      setCruushed(true);

      if (data.mutual) {
        alert(`It's mutual. You and ${mockUser.name} have a cruush on each other.`);
      }
    } catch (error) {
      console.error('Error sending cruush:', error);
    }
  };

  const handleMessage = async () => {
    if (!userId) {
      navigate('/messages');
      return;
    }

    await openConversationOrInbox(navigate, userId);
  };

  const mockUser = {
    id: userId || 'me',
    name: 'Alex',
    age: 28,
    pronouns: 'they/them',
    distance: '0.3 mi',
    photos: [],
    identities: ['nonbinary', 'queer'],
    presentation: ['androgynous', 'femme'],
    sexuality: ['queer', 'pansexual'],
    ethnicity: 'Mixed',
    bodyType: 'athletic',
    height: "5'8\"",
    weight: '155 lbs',
    position: ['versatile'],
    lookingFor: ['hookup', 'date', 'friends'],
    timing: 'now',
    hosting: ['can host'],
    vibes: ['Alt', 'Artsy', 'Goth'],
    protection: ['always', 'PrEP'],
    kinks: ['bondage', 'roleplay', 'toys'],
    hobbies: ['music', 'art', 'hiking', 'gaming'],
    hivStatus: 'negative',
    hrtStatus: 'on HRT',
    drugs: 'never',
    weed: 'sometimes',
    smoking: 'never',
    drinking: 'sometimes',
    bio: 'Artist and musician looking for genuine connections. Love late night adventures and deep conversations. T4T friendly.',
  };

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
                <Button variant="ghost" size="icon">
                  <Share2 className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Flag className="w-5 h-5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto">
        <div
          data-testid="profile-hero-media"
          className="relative w-full overflow-hidden bg-gradient-to-br from-crimson-dark to-crimson-bright"
          style={PROFILE_HERO_ASPECT_STYLE}
        >
          {mockUser.photos.length > 0 ? (
            <img
              src={mockUser.photos[0]}
              alt={mockUser.name}
              className="w-full h-full object-cover"
              style={PROFILE_HERO_ASPECT_STYLE}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Heart className="w-32 h-32 text-white/20" />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="space-y-5">
          <div className="space-y-3">
            <div>
              <h1 className="text-4xl mb-2">
                {mockUser.name}, {mockUser.age}
              </h1>
              <p className="text-muted-foreground">{mockUser.pronouns}</p>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{mockUser.distance} away</span>
              </div>
            </div>

            {!isOwnProfile && (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleCruush}
                  disabled={cruushed}
                  style={{
                    background: cruushed
                      ? '#666'
                      : 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
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
            )}
          </div>

          <Tabs defaultValue="basics" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl border border-border bg-card p-1">
              <TabsTrigger value="basics" className="min-h-11">
                Basics
              </TabsTrigger>
              <TabsTrigger value="intimacy" className="min-h-11">
                Intimacy
              </TabsTrigger>
              <TabsTrigger value="health" className="min-h-11">
                Health
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="mt-5 space-y-5">
              {mockUser.bio ? (
                <Section title="About">
                  <p className="text-muted-foreground">{mockUser.bio}</p>
                </Section>
              ) : null}

              <Section title="Identities">
                <BadgeList items={mockUser.identities} />
              </Section>

              <Section title="Presentation">
                <BadgeList items={mockUser.presentation} />
              </Section>

              <Section title="Sexuality">
                <BadgeList items={mockUser.sexuality} />
              </Section>

              <Section title="Stats">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="Ethnicity" value={mockUser.ethnicity} />
                  <DetailItem label="Body" value={mockUser.bodyType} />
                  <DetailItem label="Height" value={mockUser.height} />
                  <DetailItem label="Weight" value={mockUser.weight} />
                </div>
              </Section>

              <Section title="Hobbies">
                <BadgeList items={mockUser.hobbies} />
              </Section>
            </TabsContent>

            <TabsContent value="intimacy" className="mt-5 space-y-5">
              <Section title="Looking For">
                <BadgeList items={mockUser.lookingFor} />
                <div className="mt-2 text-sm text-muted-foreground">
                  Timing: <span className="text-foreground">{mockUser.timing}</span>
                </div>
              </Section>

              <Section title="Availability">
                <BadgeList items={[mockUser.timing]} />
              </Section>

              <Section title="Hosting/Travel">
                <BadgeList items={mockUser.hosting} />
              </Section>

              <Section title="Position">
                <BadgeList items={mockUser.position} />
              </Section>

              <Section title="Kinks">
                <BadgeList items={mockUser.kinks} />
              </Section>

              <Section title="Vibes">
                <BadgeList items={mockUser.vibes} variant="gradient" />
              </Section>
            </TabsContent>

            <TabsContent value="health" className="mt-5 space-y-5">
              <Section title="Protection">
                <BadgeList items={mockUser.protection} />
              </Section>

              <Section title="Health">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="HIV" value={mockUser.hivStatus} />
                  <DetailItem label="HRT" value={mockUser.hrtStatus} />
                </div>
              </Section>

              <Section title="Lifestyle">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="Drugs" value={mockUser.drugs} />
                  <DetailItem label="420" value={mockUser.weed} />
                  <DetailItem label="Smoking" value={mockUser.smoking} />
                  <DetailItem label="Drinking" value={mockUser.drinking} />
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm">{title}</h4>
      {children}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

function BadgeList({ items, variant = 'default' }: { items: string[]; variant?: 'default' | 'gradient' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge
          key={item}
          variant={variant === 'gradient' ? 'default' : 'secondary'}
          style={
            variant === 'gradient'
              ? {
                  background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                }
              : undefined
          }
        >
          {item}
        </Badge>
      ))}
    </div>
  );
}
