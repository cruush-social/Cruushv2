import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import ProfileCard from './ProfileCard';

export default function FeelingLucky() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState({
    id: 1,
    name: 'Alex',
    age: 28,
    pronouns: 'they/them',
    distance: '0.3 mi',
    photo: null,
    lookingFor: ['hookup', 'chat'],
    vibes: ['Alt', 'Artsy'],
  });

  const handleReroll = () => {
    const randomUsers = [
      {
        id: 2,
        name: 'Jordan',
        age: 25,
        pronouns: 'she/her',
        distance: '0.5 mi',
        photo: null,
        lookingFor: ['date', 'friends'],
        vibes: ['Femme', 'Goddess'],
      },
      {
        id: 3,
        name: 'Sam',
        age: 32,
        pronouns: 'he/him',
        distance: '0.8 mi',
        photo: null,
        lookingFor: ['hookup', 'now'],
        vibes: ['Daddy', 'Leather'],
      },
    ];
    setCurrentUser(randomUsers[Math.floor(Math.random() * randomUsers.length)]);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-xl">I'm Feeling Lucky</h2>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-2 mb-8">
          <p className="text-muted-foreground">
            Discover someone random nearby who matches your filters
          </p>
        </div>

        <ProfileCard
          user={currentUser}
          onClose={() => navigate(-1)}
          onViewProfile={() => navigate(`/profile/${currentUser.id}`)}
        />

        <Button
          onClick={handleReroll}
          variant="outline"
          className="w-full"
          style={{
            borderColor: 'var(--cruush-purple)',
            color: 'var(--cruush-purple)',
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Show Me Someone Else
        </Button>
      </div>
    </div>
  );
}
