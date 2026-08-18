import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import { revokeMutualCruush, sendCruush } from '../lib/cruushApi';
import { resolveMediaUrl } from '../lib/apiClient';
import {
  handleCruushSendSuccess,
  handleMutualCruushRevokeSuccess,
  notifyCruushSendError,
  notifyMutualCruushRevokeError,
} from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { PROFILE_CARD_COMPACT_MEDIA_STYLE, PROFILE_CARD_MEDIA_ASPECT_STYLE } from '../lib/photoLayout';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import { getProfileGradientCss } from '../lib/profileGradient';

interface ProfileCardProps {
  user: any;
  onClose: () => void;
  onViewProfile: () => void;
  placement?: 'overlay' | 'inline';
  density?: 'regular' | 'compact';
  fillAvailableHeight?: boolean;
}

export default function ProfileCard({ user, onClose, onViewProfile, placement = 'overlay', density = 'regular', fillAvailableHeight = false }: ProfileCardProps) {
  const navigate = useNavigate();
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [revokingMutual, setRevokingMutual] = useState(false);
  const [mutualRevoked, setMutualRevoked] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const isAlreadyMutual = !mutualRevoked && (cruushBecameMutual || user.relationship?.mutualCruush === true);
  const hasSentCruush = !isAlreadyMutual && !mutualRevoked && (cruushed || user.relationship?.outgoingCruush === true);
  const canMessage = !mutualRevoked && user.relationship?.canMessage !== false;
  const cruushDisabled = sendingCruush || revokingMutual || hasSentCruush;
  const maskPhoto = shouldMaskPhoto(dlModeActive, user.photoExplicit);
  const compact = placement === 'inline' && density === 'compact';
  const mediaStyle = fillAvailableHeight
    ? undefined
    : compact
      ? PROFILE_CARD_COMPACT_MEDIA_STYLE
      : PROFILE_CARD_MEDIA_ASPECT_STYLE;
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
    if (sendingCruush || revokingMutual || hasSentCruush || isAlreadyMutual) {
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

  const handleRevokeMutualCruush = async () => {
    if (!isAlreadyMutual || sendingCruush || revokingMutual) {
      return;
    }

    setRevokingMutual(true);
    try {
      await revokeMutualCruush(user.id);
      setCruushed(false);
      setCruushBecameMutual(false);
      setMutualRevoked(true);
      handleMutualCruushRevokeSuccess(user.id, user.name);
    } catch (error) {
      console.error('Error revoking mutual cruush:', error);
      notifyMutualCruushRevokeError(error);
    } finally {
      setRevokingMutual(false);
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
    ? `bg-card rounded-2xl border border-border overflow-hidden shadow-2xl max-w-sm w-full mx-auto ${fillAvailableHeight ? 'flex min-h-0 flex-1 flex-col' : compact ? '' : 'overflow-y-auto'}`
    : 'bg-card rounded-2xl border border-border overflow-hidden overflow-y-auto shadow-2xl max-w-sm w-full mx-auto fixed left-1/2 -translate-x-1/2 bottom-24 z-30';

  return (
    <div data-testid="profile-card" className={cardClassName} style={{ maxHeight: placement === 'inline' ? undefined : '80vh' }}>
      <div
        data-testid="profile-card-media"
        className={`relative w-full ${fillAvailableHeight ? 'min-h-0 flex-1' : ''}`}
        style={{ ...mediaStyle, background: 'var(--cruush-gradient)' }}
      >
        {user.photo && !maskPhoto ? (
          <img src={resolveMediaUrl(user.photo)} alt={user.name} className="h-full w-full object-cover" style={mediaStyle} />
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
            className={`${actionButtonClassName} rounded-xl border ${isAlreadyMutual
              ? 'border-[#FF0072]/45 bg-[#FF0072]/10 text-[#FF8BBB] hover:bg-[#FF0072]/16'
              : cruushDisabled
                ? 'border-white/10 bg-white/[0.06] text-white/45'
                : 'border-transparent text-white hover:brightness-110'}`}
            onClick={() => {
              void (isAlreadyMutual ? handleRevokeMutualCruush() : handleCruush());
            }}
            disabled={cruushDisabled}
            aria-label={revokingMutual ? 'Removing mutual cruush' : isAlreadyMutual ? 'Remove mutual cruush' : hasSentCruush ? 'cruush sent' : sendingCruush ? 'sending cruush' : 'send cruush'}
            style={{
              background: !isAlreadyMutual && !cruushDisabled ? 'var(--cruush-gradient)' : undefined,
            }}
          >
            <CruushIcon name="safety" className={`mr-2 h-4 w-4 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant="white" />
            {revokingMutual ? 'removing...' : isAlreadyMutual ? 'remove' : hasSentCruush ? 'sent' : sendingCruush ? 'sending...' : 'cruush'}
          </Button>
          <Button
            className={`${actionButtonClassName} rounded-xl border border-[#6F00FF]/55 bg-[var(--cruush-gradient-soft-18)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-[var(--cruush-gradient-soft-28)]`}
            disabled={openingMessage || !canMessage}
            onClick={() => {
              void handleMessage();
            }}
          >
            <CruushIcon name="send" className="mr-2 h-4 w-4" variant="white" />
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
