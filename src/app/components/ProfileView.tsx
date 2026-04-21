import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Heart, MessageCircle, Share2, Flag, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

export default function ProfileView() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const isOwnProfile = !userId;
  const [cruushed, setCruushed] = useState(false);

  const handleCruush = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-546a0ad0/cruush`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fromUserId: userData.id,
            toUserId: userId,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCruushed(true);

        if (data.mutual) {
          alert("It's a match! 💕");
        }
      }
    } catch (error) {
      console.error('Error sending cruush:', error);
    }
  };

  const handleMessage = () => {
    navigate('/messages');
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
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center justify-between z-10">
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
      </header>

      <div className="max-w-2xl mx-auto">
        <div className="relative w-full bg-gradient-to-br from-crimson-dark to-crimson-bright" style={{ aspectRatio: '9/16' }}>
          {mockUser.photos.length > 0 ? (
            <img
              src={mockUser.photos[0]}
              alt={mockUser.name}
              className="w-full h-full object-cover"
              style={{ aspectRatio: '9/16' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Heart className="w-32 h-32 text-white/20" />
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-4xl mb-2">
              {mockUser.name}, {mockUser.age}
            </h1>
            <p className="text-muted-foreground">{mockUser.pronouns}</p>
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{mockUser.distance} away</span>
            </div>
          </div>

          {mockUser.bio && (
            <div>
              <h3 className="text-lg mb-2">About</h3>
              <p className="text-muted-foreground">{mockUser.bio}</p>
            </div>
          )}

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
                onClick={handleMessage}
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

          <Tabs defaultValue="basics" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="intimacy">Intimacy</TabsTrigger>
              <TabsTrigger value="interests">Interests</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="space-y-4 mt-4">
              <Section title="Identities">
                <BadgeList items={mockUser.identities} />
              </Section>

              <Section title="Presentation">
                <BadgeList items={mockUser.presentation} />
              </Section>

              <Section title="Stats">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Ethnicity:</span>{' '}
                    <span>{mockUser.ethnicity}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Body:</span>{' '}
                    <span>{mockUser.bodyType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Height:</span>{' '}
                    <span>{mockUser.height}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Weight:</span>{' '}
                    <span>{mockUser.weight}</span>
                  </div>
                </div>
              </Section>

              <Section title="Looking For">
                <BadgeList items={mockUser.lookingFor} />
                <div className="mt-2 text-sm text-muted-foreground">
                  Timing: <span className="text-foreground">{mockUser.timing}</span>
                </div>
              </Section>

              <Section title="Hosting/Travel">
                <BadgeList items={mockUser.hosting} />
              </Section>
            </TabsContent>

            <TabsContent value="intimacy" className="space-y-4 mt-4">
              <Section title="Position">
                <BadgeList items={mockUser.position} />
              </Section>

              <Section title="Protection">
                <BadgeList items={mockUser.protection} />
              </Section>

              <Section title="Kinks">
                <BadgeList items={mockUser.kinks} />
              </Section>

              <Section title="Health">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">HIV:</span>{' '}
                    <span>{mockUser.hivStatus}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">HRT:</span>{' '}
                    <span>{mockUser.hrtStatus}</span>
                  </div>
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="interests" className="space-y-4 mt-4">
              <Section title="Vibes">
                <BadgeList items={mockUser.vibes} variant="gradient" />
              </Section>

              <Section title="Hobbies">
                <BadgeList items={mockUser.hobbies} />
              </Section>

              <Section title="Lifestyle">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Drugs:</span>{' '}
                    <span>{mockUser.drugs}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">420:</span>{' '}
                    <span>{mockUser.weed}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Smoking:</span>{' '}
                    <span>{mockUser.smoking}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Drinking:</span>{' '}
                    <span>{mockUser.drinking}</span>
                  </div>
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
