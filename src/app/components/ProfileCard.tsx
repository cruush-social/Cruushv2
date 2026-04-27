import { useState } from 'react';
import { useNavigate } from 'react-router';
import { X, Heart, MessageCircle, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

interface ProfileCardProps {
  user: any;
  onClose: () => void;
  onViewProfile: () => void;
}

export default function ProfileCard({ user, onClose, onViewProfile }: ProfileCardProps) {
  const navigate = useNavigate();
  const [cruushed, setCruushed] = useState(false);

  const handleCruush = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('cruush_user') || '{}');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-546a0ad0/cruush`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fromUserId: userData.id,
            toUserId: user.id,
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
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-2xl max-w-xs w-full mx-auto fixed left-1/2 -translate-x-1/2 bottom-24 z-30" style={{ maxHeight: '80vh' }}>
      <div className="relative w-full bg-gradient-to-br from-crimson-dark to-crimson-bright" style={{ aspectRatio: '9/16' }}>
        {user.photo ? (
          <img src={user.photo} alt={user.name} className="w-full h-full object-cover" style={{ aspectRatio: '9/16' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Heart className="w-24 h-24 text-white/20" />
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <h3 className="text-2xl">
            {user.name}, {user.age}
          </h3>
          <p className="text-sm text-white/80">{user.pronouns}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4" />
          <span>{user.distance} away</span>
        </div>

        <div className="space-y-2">
          <p className="text-sm">Looking for</p>
          <div className="flex flex-wrap gap-2">
            {user.lookingFor?.map((item: string) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>
        </div>

        {user.vibes && user.vibes.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm">Vibes</p>
            <div className="flex flex-wrap gap-2">
              {user.vibes.map((vibe: string) => (
                <Badge
                  key={vibe}
                  variant="outline"
                  className="border-primary/50 text-primary"
                >
                  {vibe}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCruush}
            disabled={cruushed}
            style={{
              borderColor: 'var(--cruush-pink)',
              color: 'var(--cruush-pink)',
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

        <Button onClick={onViewProfile} className="w-full" variant="secondary">
          View Full Profile
        </Button>
      </div>
    </div>
  );
}
