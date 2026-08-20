import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import { revokeMutualCruush, revokeSentCruush, sendCruush } from '../lib/cruushApi';
import { resolveMediaUrl } from '../lib/apiClient';
import {
  handleCruushSendSuccess,
  handleMutualCruushRevokeSuccess,
  handleSentCruushRevokeSuccess,
  notifyCruushSendError,
  notifyMutualCruushRevokeError,
  notifySentCruushRevokeError,
} from '../lib/cruushNotifications';
import { openConversationOrInbox } from '../lib/openConversation';
import { PROFILE_CARD_COMPACT_MEDIA_STYLE, PROFILE_CARD_MEDIA_ASPECT_STYLE } from '../lib/photoLayout';
import { addDlModeChangedListener, isDlModeEnabled, shouldMaskPhoto } from '../lib/dlMode';
import { getProfileGradientCss } from '../lib/profileGradient';
import { formatDistanceLabel, useDistancePreferences } from '../lib/distancePreferences';

interface ProfileCardProps {
  user: any;
  onClose: () => void;
  onViewProfile: () => void;
  placement?: 'overlay' | 'inline';
  density?: 'regular' | 'compact';
  fillAvailableHeight?: boolean;
  presentation?: 'standard' | 'carousel';
  onBrowseAgain?: () => void;
}

export default function ProfileCard({
  user,
  onClose,
  onViewProfile,
  placement = 'overlay',
  density = 'regular',
  fillAvailableHeight = false,
  presentation = 'standard',
  onBrowseAgain,
}: ProfileCardProps) {
  const navigate = useNavigate();
  const distancePreferences = useDistancePreferences();
  const [cruushed, setCruushed] = useState(false);
  const [cruushBecameMutual, setCruushBecameMutual] = useState(false);
  const [sendingCruush, setSendingCruush] = useState(false);
  const [revokingCruush, setRevokingCruush] = useState(false);
  const [mutualRevoked, setMutualRevoked] = useState(false);
  const [outgoingRevoked, setOutgoingRevoked] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [dlModeActive, setDlModeActive] = useState(() => isDlModeEnabled());
  const isAlreadyMutual = !mutualRevoked && (cruushBecameMutual || user.relationship?.mutualCruush === true);
  const hasSentCruush = !isAlreadyMutual && !outgoingRevoked && (cruushed || user.relationship?.outgoingCruush === true);
  const hasRevocableCruush = isAlreadyMutual || hasSentCruush;
  const canMessage = !mutualRevoked && user.relationship?.canMessage !== false;
  const cruushDisabled = sendingCruush || revokingCruush;
  const maskPhoto = shouldMaskPhoto(dlModeActive, user.photoExplicit);
  const carouselPresentation = presentation === 'carousel';
  const compact = placement === 'inline' && density === 'compact';
  const mediaStyle = fillAvailableHeight
    ? undefined
    : compact
      ? PROFILE_CARD_COMPACT_MEDIA_STYLE
      : PROFILE_CARD_MEDIA_ASPECT_STYLE;
  const lookingForItems = Array.isArray(user.lookingFor)
    ? user.lookingFor.filter((item: string) => item.trim().length > 0)
    : [];
  const vibeItems = Array.isArray(user.vibes)
    ? user.vibes.filter((item: string) => item.trim().length > 0)
    : [];
  const visibleVibeItems = compact || carouselPresentation ? vibeItems.slice(0, 3) : vibeItems;
  const contentClassName = compact ? 'p-3 space-y-3' : 'p-4 space-y-4';
  const titleClassName = compact ? 'text-xl' : 'text-2xl';
  const actionButtonClassName = compact ? 'h-10 min-w-0 flex-1' : 'flex-1';
  const mediaCaptionClassName = compact
    ? 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3'
    : 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4';

  useEffect(() => addDlModeChangedListener(setDlModeActive), []);

  const handleCruush = async () => {
    if (sendingCruush || revokingCruush || hasSentCruush || isAlreadyMutual) {
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
      setMutualRevoked(false);
      setOutgoingRevoked(false);
      handleCruushSendSuccess(user.id, user.name, data);
    } catch (error) {
      console.error('Error sending cruush:', error);
      notifyCruushSendError(error);
    } finally {
      setSendingCruush(false);
    }
  };

  const handleRevokeCruush = async () => {
    if (!hasRevocableCruush || sendingCruush || revokingCruush) {
      return;
    }

    const mutual = isAlreadyMutual;
    setRevokingCruush(true);
    try {
      if (mutual) {
        await revokeMutualCruush(user.id);
      } else {
        await revokeSentCruush(user.id);
      }
      setCruushed(false);
      setCruushBecameMutual(false);
      setOutgoingRevoked(true);
      if (mutual) {
        setMutualRevoked(true);
        handleMutualCruushRevokeSuccess(user.id, user.name);
      } else {
        handleSentCruushRevokeSuccess(user.id, user.name);
      }
    } catch (error) {
      console.error('Error revoking cruush:', error);
      if (mutual) {
        notifyMutualCruushRevokeError(error);
      } else {
        notifySentCruushRevokeError(error);
      }
    } finally {
      setRevokingCruush(false);
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

  if (carouselPresentation) {
    const carouselActionClassName = 'h-10 min-w-0 rounded-xl border border-white/10 bg-black/55 px-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl hover:bg-black/70';

    return (
      <div
        data-testid="profile-card"
        className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.48)]"
      >
        <div data-testid="profile-card-media" className="absolute inset-0" style={{ background: 'var(--cruush-gradient)' }}>
          {user.photo && !maskPhoto ? (
            <img src={resolveMediaUrl(user.photo)} alt={user.name} className="h-full w-full object-cover" />
          ) : maskPhoto ? (
            <div
              aria-label={user.name}
              className="flex h-full w-full items-center justify-center"
              role="img"
              style={{ background: getProfileGradientCss(user.id) }}
            >
              <Eye className="h-12 w-12 text-white/80" strokeWidth={2.35} />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <CruushIcon name="cruush" className="h-24 w-24 opacity-20" />
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/15" />

        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
          {onBrowseAgain ? (
            <button
              type="button"
              onClick={onBrowseAgain}
              className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 text-sm text-white/90 backdrop-blur-xl transition hover:bg-black/70 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Browse again
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/90 backdrop-blur-xl transition hover:bg-black/70 hover:text-white"
            aria-label="Close profile preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 p-3">
          <div
            data-testid="carousel-profile-glass"
            className="rounded-2xl border border-white/10 bg-black/60 p-3 text-white shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          >
            <div className="min-w-0">
              <h3 className="truncate text-2xl">
                {user.name}, {user.age}
              </h3>
              <div className="mt-1">
                <CruushBadge badges={user.badges} compact />
              </div>
              <p className="mt-1 text-sm text-white/80">{user.pronouns}</p>
            </div>

            <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
              <CruushIcon name="map" className="h-4 w-4 opacity-80" />
              <span>{formatDistanceLabel(user.distance, distancePreferences.mode)} away</span>
            </div>

            {visibleVibeItems.length > 0 ? (
              <div data-testid="profile-card-vibes" className="mt-2 flex min-w-0 flex-nowrap gap-1.5 overflow-hidden">
                {visibleVibeItems.map((vibe: string) => (
                  <Badge
                    key={vibe}
                    variant="outline"
                    className="min-w-0 shrink border-primary/50 bg-black/35 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-primary backdrop-blur-sm"
                  >
                    <span className="block min-w-0 truncate">{vibe}</span>
                  </Badge>
                ))}
              </div>
            ) : null}

            <div data-testid="carousel-profile-actions" className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                className={`${carouselActionClassName} ${hasRevocableCruush ? 'text-[#FF8BBB]' : ''}`}
                onClick={() => {
                  void (hasRevocableCruush ? handleRevokeCruush() : handleCruush());
                }}
                disabled={cruushDisabled}
                aria-label={revokingCruush ? (isAlreadyMutual ? 'Removing mutual cruush' : 'Unsending cruush') : isAlreadyMutual ? 'Remove mutual cruush' : hasSentCruush ? 'Unsend cruush' : sendingCruush ? 'sending cruush' : 'send cruush'}
              >
                <CruushIcon name="safety" className={`mr-2 h-4 w-4 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant="white" />
                {revokingCruush ? (isAlreadyMutual ? 'removing...' : 'unsending...') : isAlreadyMutual ? 'remove' : hasSentCruush ? 'unsend' : sendingCruush ? 'sending...' : 'cruush'}
              </Button>
              <Button
                type="button"
                className={carouselActionClassName}
                disabled={openingMessage || !canMessage}
                onClick={() => {
                  void handleMessage();
                }}
              >
                <CruushIcon name="send" className="mr-2 h-4 w-4" variant="white" />
                {!canMessage ? 'Mutuals only' : openingMessage ? 'Opening...' : 'Message'}
              </Button>
              <Button
                type="button"
                onClick={onViewProfile}
                className={`${carouselActionClassName} col-span-2`}
                variant="secondary"
              >
                View Full Profile
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <span>{formatDistanceLabel(user.distance, distancePreferences.mode)} away</span>
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

        {visibleVibeItems.length > 0 ? (
          <div className={compact ? '' : 'space-y-2'}>
            {!compact ? <p className="text-sm">Vibes</p> : null}
            <div
              data-testid="profile-card-vibes"
              className={compact ? 'flex min-w-0 flex-nowrap gap-1.5 overflow-hidden' : 'flex flex-wrap gap-2'}
            >
              {visibleVibeItems.map((vibe: string) => (
                <Badge
                  key={vibe}
                  variant="outline"
                  className={compact
                    ? 'min-w-0 shrink whitespace-nowrap border-primary/50 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-primary'
                    : 'border-primary/50 text-primary'}
                >
                  {/* Badge is a centred flex row, so text-overflow on the badge
                      itself clips the label at both ends instead of ellipsising
                      it. The label needs its own block box to truncate. */}
                  {compact ? <span className="block min-w-0 truncate">{vibe}</span> : vibe}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 pt-2">
          <Button
            className={`${actionButtonClassName} rounded-xl border ${hasRevocableCruush
              ? 'border-[#FF0072]/45 bg-[#FF0072]/10 text-[#FF8BBB] hover:bg-[#FF0072]/16'
              : cruushDisabled
                ? 'border-white/10 bg-white/[0.06] text-white/45'
                : 'border-transparent text-white hover:brightness-110'}`}
            onClick={() => {
              void (hasRevocableCruush ? handleRevokeCruush() : handleCruush());
            }}
            disabled={cruushDisabled}
            aria-label={revokingCruush ? (isAlreadyMutual ? 'Removing mutual cruush' : 'Unsending cruush') : isAlreadyMutual ? 'Remove mutual cruush' : hasSentCruush ? 'Unsend cruush' : sendingCruush ? 'sending cruush' : 'send cruush'}
            style={{
              background: !hasRevocableCruush && !cruushDisabled ? 'var(--cruush-gradient)' : undefined,
            }}
          >
            <CruushIcon name="safety" className={`mr-2 h-4 w-4 ${cruushDisabled ? 'opacity-45 grayscale' : ''}`} variant="white" />
            {revokingCruush ? (isAlreadyMutual ? 'removing...' : 'unsending...') : isAlreadyMutual ? 'remove' : hasSentCruush ? 'unsend' : sendingCruush ? 'sending...' : 'cruush'}
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
