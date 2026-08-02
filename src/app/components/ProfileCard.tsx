import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import { sendCruush } from '../lib/cruushApi';
import { resolveMediaUrl } from '../lib/apiClient';
import { handleCruushSendSuccess, notifyCruushSendError } from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { PROFILE_CARD_COMPACT_MEDIA_STYLE, PROFILE_CARD_MEDIA_ASPECT_STYLE } from '../lib/photoLayout';
import { addDlModeChangedListener, isDlModeEnabled } from '../lib/dlMode';
import { getProfileGradientCss } from '../lib/profileGradient';

interface ProfileCardProps {
  user: any;
  onClose: () => void;
  onViewProfile: () => void;
  placement?: 'overlay' | 'inline';
  density?: 'regular' | 'compact';
}

export default function ProfileCard({ user, onClose, onViewProfile, placement = 'overlay', density = 'regular' }: ProfileCardProps) {
  const navigate = useNavigate();
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const isAlreadyMutual = cruushBecameMutual || user.relationship?.mutualCruush === true;
  const hasSentCruush = cruushed || user.relationship?.outgoingCruush === true;
  const canMessage = user.relationship?.canMessage !== false;
  const cruushDisabled = sendingCruush || hasSentCruush || isAlreadyMutual;
  const maskPhoto = Boolean(dlModeActive && user.photo && user.photoExplicit === true);
  const compact = placement === 'inline' && density === 'compact';
  const mediaStyle = compact ? PROFILE_CARD_COMPACT_MEDIA_STYLE : PROFILE_CARD_MEDIA_ASPECT_STYLE;
  const lookingForItems = Array.isArray(user.lookingFor)
    ? user.lookingFor.filter((item: string) => item.trim().length > 0)
    : [];
  const contentClassName = compact ? 'p-3 space-y-3' : 'p-4 space-y-4';
  const titleClassName = compact ? 'text-xl' : 'text-2xl';
  const actionButtonClassName = compact ? 'h-10 min-w-0 flex-1' : 'flex-1';
  const mediaCaptionClassName = compact
    ? 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3'
    : 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4';

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

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

    if (!canMessage) {
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
    ? `bg-card rounded-2xl border border-border overflow-hidden shadow-2xl max-w-sm w-full mx-auto ${compact ? '' : 'overflow-y-auto'}`
    : 'bg-card rounded-2xl border border-border overflow-hidden overflow-y-auto shadow-2xl max-w-sm w-full mx-auto fixed left-1/2 -translate-x-1/2 bottom-24 z-30';

  return (
    <div data-testid="profile-card" className={cardClassName} style={{ maxHeight: placement === 'inline' ? undefined : '80vh' }}>
      <div
        data-testid="profile-card-media"
        className="relative w-full"
        style={{ ...mediaStyle, background: 'var(--cruush-gradient)' }}
      >
        {user.photo && !maskPhoto ? (
          <img src={resolveMediaUrl(user.photo)} alt={user.name} className="w-full h-full object-cover" style={mediaStyle} />
        ) : maskPhoto ? (
          <div
            aria-label={user.name}
            className="flex h-full w-full items-center justify-center"
            role="img"
            style={{ ...mediaStyle, background: getProfileGradientCss(user.id) }}
          >
            <Eye className="h-12 w-12 text-white/80" strokeWidth={2.35} />
          </div>
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

        <div className={mediaCaptionClassName}>
          <h3 className={titleClassName}>
            {user.name}, {user.age}
          </h3>
          <CruushBadge badges={user.badges} compact />
          <p className="text-sm text-white/80">{user.pronouns}</p>
        </div>
      </div>

      <div className={contentClassName}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CruushIcon name="map" className="h-4 w-4 opacity-70" />
          <span>{user.distance} away</span>
        </div>

        {!compact && lookingForItems.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm">Looking for</p>
            <div className="flex flex-wrap gap-2">
              {lookingForItems.map((item: string) => (
                <Badge key={item} variant="secondary">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {!compact && user.vibes && user.vibes.length > 0 && (
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
            className={actionButtonClassName}
            onClick={handleCruush}
            disabled={cruushDisabled}
            aria-label={isAlreadyMutual ? 'Already mutual' : hasSentCruush ? 'cruush sent' : sendingCruush ? 'sending cruush' : 'send cruush'}
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
            className={actionButtonClassName}
            disabled={openingMessage || !canMessage}
            onClick={() => {
              void handleMessage();
            }}
            style={{
              borderColor: 'var(--cruush-purple)',
              color: 'var(--cruush-purple)',
            }}
          >
            <CruushIcon name="send" className="mr-2 h-4 w-4" variant="colored" />
            {!canMessage ? 'Mutuals only' : openingMessage ? 'Opening...' : 'Message'}
          </Button>
        </div>

        <Button onClick={onViewProfile} className={compact ? 'h-10 w-full' : 'w-full'} variant="secondary">
          View Full Profile
        </Button>
      </div>
    </div>
  );
}
