import { useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import { sendCruush } from '../lib/cruushApi';
import { resolveMediaUrl } from '../lib/apiClient';
import { handleCruushSendSuccess, notifyCruushSendError } from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { PROFILE_CARD_MEDIA_ASPECT_STYLE } from '../lib/photoLayout';

interface ProfileCardProps {
  user: any;
  onClose: () => void;
  onViewProfile: () => void;
  placement?: 'overlay' | 'inline';
}

export default function ProfileCard({ user, onClose, onViewProfile, placement = 'overlay' }: ProfileCardProps) {
  const navigate = useNavigate();
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const isAlreadyMutual = cruushBecameMutual || user.relationship?.mutualCruush === true;
  const hasSentCruush = cruushed || user.relationship?.outgoingCruush === true;
  const cruushDisabled = sendingCruush || hasSentCruush || isAlreadyMutual;

  const handleCruush = async () => {
    if (sendingCruush || hasSentCruush || isAlreadyMutual) {
      return;
    }

    setSendingCruush(true);
    try {
      const data = await sendCruush(user.id, {
        name: user.name,
        pronouns: user.pronouns,
        photo: user.photo ?? null,
      });
      setCruushed(true);
      setCruushBecameMutual(data.mutual === true);
      handleCruushSendSuccess(user.id, user.name, data);
    } catch (error) {
      console.error('Error sending cruush:', error);
      notifyCruushSendError(error);
    } finally {
      setSendingCruush(false);
    }
  };

  const handleMessage = async () => {
    if (openingMessage) {
      return;
    }

    setOpeningMessage(true);
    try {
      await openConversationOrInbox(navigate, user.id);
    } finally {
      setOpeningMessage(false);
    }
  };

  const cardClassName = placement === 'inline'
    ? 'bg-card rounded-2xl border border-border overflow-hidden overflow-y-auto shadow-2xl max-w-sm w-full mx-auto'
    : 'bg-card rounded-2xl border border-border overflow-hidden overflow-y-auto shadow-2xl max-w-sm w-full mx-auto fixed left-1/2 -translate-x-1/2 bottom-24 z-30';

  return (
    <div className={cardClassName} style={{ maxHeight: placement === 'inline' ? undefined : '80vh' }}>
      <div
        className="relative w-full"
        style={{ ...PROFILE_CARD_MEDIA_ASPECT_STYLE, background: 'var(--cruush-gradient)' }}
      >
        {user.photo ? (
          <img src={resolveMediaUrl(user.photo)} alt={user.name} className="w-full h-full object-cover" style={PROFILE_CARD_MEDIA_ASPECT_STYLE} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CruushIcon name="cruush" className="h-24 w-24 opacity-20" />
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
          <CruushBadge badges={user.badges} compact />
          <p className="text-sm text-white/80">{user.pronouns}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CruushIcon name="map" className="h-4 w-4 opacity-70" />
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
            disabled={cruushDisabled}
            aria-label={isAlreadyMutual ? 'Already mutual' : hasSentCruush ? 'Cruush sent' : sendingCruush ? 'Sending cruush' : 'Send cruush'}
            style={{
              borderColor: cruushDisabled ? '#73737C' : 'var(--cruush-pink)',
              color: cruushDisabled ? '#A2A2AA' : 'var(--cruush-pink)',
            }}
          >
            <CruushIcon name="cruush" className={`mr-2 h-4 w-4 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant={cruushDisabled ? 'white' : 'colored'} />
            {isAlreadyMutual ? 'mutual' : hasSentCruush ? 'sent' : sendingCruush ? 'sending...' : 'cruush'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={openingMessage}
            onClick={() => {
              void handleMessage();
            }}
            style={{
              borderColor: 'var(--cruush-purple)',
              color: 'var(--cruush-purple)',
            }}
          >
            <CruushIcon name="send" className="mr-2 h-4 w-4" variant="colored" />
            {openingMessage ? 'Opening...' : 'Message'}
          </Button>
        </div>

        <Button onClick={onViewProfile} className="w-full" variant="secondary">
          View Full Profile
        </Button>
      </div>
    </div>
  );
}
