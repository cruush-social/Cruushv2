import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { CruushIcon } from './CruushIconImage';
import ProfileCard from './ProfileCard';
import { getMyBillingStatus } from '../lib/billingApi';

export default function FeelingLucky() {
  const navigate = useNavigate();
  const [isCruushPlus, setIsCruushPlus] = useState<boolean | null>(null);
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

  useEffect(() => {
    getMyBillingStatus()
      .then((status) => setIsCruushPlus(status.cruushPlus))
      .catch(() => setIsCruushPlus(null));
  }, []);

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
          <CruushIcon name="lucky" className="h-5 w-5" variant="colored" />
          <h2 className="text-xl">I'm Feeling Lucky</h2>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {isCruushPlus === false ? (
          <div className="rounded-lg border border-primary/25 bg-primary/10 p-4 text-center">
            <p className="text-white">I'm Feeling Lucky is included with cruush+.</p>
            <p className="mt-1 text-sm text-muted-foreground">Unlock premium discovery when you want it.</p>
            <Button
              type="button"
              className="mt-4 rounded-lg text-white"
              style={{ background: 'var(--cruush-gradient)' }}
              onClick={() => navigate('/upgrade')}
            >
              Get cruush+
            </Button>
          </div>
        ) : null}

        {isCruushPlus !== false ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
