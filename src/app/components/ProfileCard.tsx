import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import CruushBadge from './CruushBadge';
import CruushIconImage, { CruushIcon } from './CruushIconImage';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import HeartPhoto from './HeartPhoto';
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
import { resolveVibeTone, vibeCapsuleStyle } from '../lib/vibeTone';
import { formatDistanceLabel, useDistancePreferences } from '../lib/distancePreferences';
import { getProfileById } from '../lib/profileApi';

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

function getCarouselPhotos(user: any) {
  const suppliedPhotos = Array.isArray(user.photos) ? user.photos : [];

  return Array.from(new Set(
    [user.photo, ...suppliedPhotos]
      .filter((photo): photo is string => typeof photo === 'string' && photo.trim().length > 0),
  )).slice(0, 4);
}

function getPhotoExplicitMap(photoMetadata: unknown) {
  if (!Array.isArray(photoMetadata)) {
    return {} as Record<string, boolean>;
  }

  return Object.fromEntries(photoMetadata
    .filter((metadata): metadata is { url: string; explicit?: boolean } => (
      Boolean(metadata) && typeof metadata.url === 'string'
    ))
    .map((metadata) => [metadata.url, metadata.explicit === true]));
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
  const [carouselPhotos, setCarouselPhotos] = useState<string[]>(() => getCarouselPhotos(user));
  const [carouselPhotoExplicit, setCarouselPhotoExplicit] = useState<Record<string, boolean>>(
    () => getPhotoExplicitMap(user.photo_metadata),
  );
  const [activeCarouselPhotoIndex, setActiveCarouselPhotoIndex] = useState(0);
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

  useEffect(() => {
    if (!carouselPresentation) {
      return undefined;
    }

    const suppliedPhotos = getCarouselPhotos(user);
    setCarouselPhotos(suppliedPhotos);
    setCarouselPhotoExplicit(getPhotoExplicitMap(user.photo_metadata));
    setActiveCarouselPhotoIndex(0);

    if (Array.isArray(user.photos) || !user.id) {
      return undefined;
    }

    let cancelled = false;
    void getProfileById(user.id)
      .then((profile) => {
        if (cancelled) {
          return;
        }

        const profilePhotos = getCarouselPhotos({
          photo: user.photo,
          photos: profile.photos,
        });
        setCarouselPhotos(profilePhotos);
        setCarouselPhotoExplicit(getPhotoExplicitMap(profile.photo_metadata));
        setActiveCarouselPhotoIndex(0);
      })
      .catch(() => {
        // Discovery already supplied the primary photo. Keep that usable when
        // optional gallery details are unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [carouselPresentation, user.id, user.photo]);

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
    const carouselTextOutlineStyle = {
      textShadow: [
        '1px 0 0 #000',
        '-1px 0 0 #000',
        '0 1px 0 #000',
        '0 -1px 0 #000',
        '1px 1px 0 #000',
        '-1px 1px 0 #000',
        '1px -1px 0 #000',
        '-1px -1px 0 #000',
        '0 2px 3px rgba(0, 0, 0, 0.55)',
      ].join(', '),
    };
    // Their privacy decides this: discovery only reports precise display when
    // the viewer is allowed to see their real pin.
    const canCenterCarouselPin = user.relationship?.precision === 'precise'
      || user.displayMode === 'PRECISE';
    const activeCarouselPhoto = carouselPhotos[activeCarouselPhotoIndex] ?? user.photo ?? null;
    const activeCarouselPhotoMasked = Boolean(activeCarouselPhoto && shouldMaskPhoto(
      dlModeActive,
      carouselPhotoExplicit[activeCarouselPhoto] ?? (activeCarouselPhoto === user.photo ? user.photoExplicit : false),
    ));
    const previewCarouselPhotos = carouselPhotos
      .map((photo, index) => ({ photo, index }))
      .filter(({ index }) => index !== activeCarouselPhotoIndex)
      .slice(0, 3);

    return (
      <div
        data-testid="profile-card"
        className="relative mx-auto h-full min-h-0 w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.48)]"
      >
        <div data-testid="profile-card-media" className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ background: 'var(--cruush-gradient)' }}>
          {activeCarouselPhoto && !activeCarouselPhotoMasked ? (
            <>
              <img
                src={resolveMediaUrl(activeCarouselPhoto)}
                alt={user.name}
                className="relative z-10 h-full w-full object-cover"
                data-testid="carousel-profile-photo"
              />
            </>
          ) : activeCarouselPhotoMasked ? (
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

        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black via-transparent to-black/20" />

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

        {previewCarouselPhotos.length > 0 ? (
          <div
            data-testid="carousel-profile-photo-hearts"
            className="pointer-events-none absolute bottom-[14.5rem] right-3 top-[4.75rem] z-30 flex flex-col items-center justify-center gap-2"
          >
            {previewCarouselPhotos.map(({ photo, index }) => (
              <HeartPhoto
                key={photo}
                className="pointer-events-auto h-[clamp(2.75rem,8dvh,3.6rem)] w-[clamp(2.75rem,8dvh,3.6rem)] shrink-0 drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)] transition hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                label={`Show profile photo ${index + 1}`}
                masked={shouldMaskPhoto(
                  dlModeActive,
                  carouselPhotoExplicit[photo] ?? (photo === user.photo ? user.photoExplicit : false),
                )}
                onClick={() => setActiveCarouselPhotoIndex(index)}
                photo={photo}
                theme="nearby"
                userId={user.id}
              />
            ))}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 z-20 p-3">
          <div
            data-testid="carousel-profile-glass"
            className="text-white"
          >
            <div className="min-w-0">
              <h3 className="truncate text-2xl font-semibold" style={carouselTextOutlineStyle}>
                {user.name}, {user.age}
              </h3>
              <div className="mt-1">
                <CruushBadge badges={user.badges} compact />
              </div>
              <p className="mt-1 text-sm text-white" style={carouselTextOutlineStyle}>{user.pronouns}</p>
            </div>

            <div className="mt-2 flex items-center gap-2 text-sm text-white" style={carouselTextOutlineStyle}>
              <CruushIcon name="map" className="h-4 w-4 drop-shadow-[0_1px_2px_#000]" />
              <span>{formatDistanceLabel(user.distance, distancePreferences.mode)} away</span>
            </div>

            {visibleVibeItems.length > 0 ? (
              <div data-testid="profile-card-vibes" className="mt-2 flex min-w-0 flex-nowrap gap-1.5 overflow-hidden">
                {visibleVibeItems.map((vibe: string) => (
                  <Badge
                    key={vibe}
                    variant="outline"
                    className="min-w-0 shrink border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] backdrop-blur-sm"
                    style={vibeCapsuleStyle(resolveVibeTone({ mutual: isAlreadyMutual, isCurrentUser: user.isCurrentUser }))}
                  >
                    <span className="block min-w-0 truncate">{vibe}</span>
                  </Badge>
                ))}
              </div>
            ) : null}

            <div data-testid="carousel-profile-actions" className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                className={`${carouselActionClassName} border-0 text-white`}
                style={{
                  background: hasRevocableCruush
                    ? 'var(--cruush-gradient-soft-28)'
                    : 'var(--cruush-gradient)',
                }}
                onClick={() => {
                  void (hasRevocableCruush ? handleRevokeCruush() : handleCruush());
                }}
                disabled={cruushDisabled}
                aria-label={revokingCruush ? (isAlreadyMutual ? 'Removing mutual' : 'Unsending cruush') : isAlreadyMutual ? 'Remove mutual' : hasSentCruush ? 'Unsend cruush' : sendingCruush ? 'sending cruush' : 'send cruush'}
              >
                <CruushIcon name={hasRevocableCruush ? 'safety' : 'cruush'} className="mr-2 h-4 w-4" variant="white" />
                {revokingCruush ? (isAlreadyMutual ? 'removing...' : 'unsending...') : isAlreadyMutual ? 'mutual' : hasSentCruush ? 'sent' : sendingCruush ? 'sending...' : 'cruush'}
              </Button>
              <Button
                type="button"
                className={`${carouselActionClassName} border-0 text-white`}
                style={{ background: 'var(--cruush-gradient)' }}
                disabled={openingMessage || !canMessage}
                onClick={() => {
                  void handleMessage();
                }}
              >
                <CruushIcon name="messages" className="mr-2 h-4 w-4" variant="white" />
                {!canMessage ? 'Mutuals only' : openingMessage ? 'Opening...' : 'Message'}
              </Button>
              {canCenterCarouselPin ? (
                <Button
                  type="button"
                  className={`${carouselActionClassName} border-0 text-white`}
                  style={{ background: 'var(--cruush-gradient)' }}
                  aria-label={`Center the map on ${user.name}`}
                  onClick={() => navigate('/map', { state: { focusUserId: user.id } })}
                >
                  <CruushIconImage src={mapIconWhite} className="mr-2 h-4 w-4" />
                  Their pin
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={onViewProfile}
                className={`${carouselActionClassName} border-0 text-white ${canCenterCarouselPin ? '' : 'col-span-2'}`}
                style={{ background: 'var(--cruush-gradient)' }}
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
              ? 'border-transparent text-white hover:brightness-125'
              : cruushDisabled
                ? 'border-white/10 bg-white/[0.06] text-white/45'
                : 'border-transparent text-white hover:brightness-110'}`}
            onClick={() => {
              void (hasRevocableCruush ? handleRevokeCruush() : handleCruush());
            }}
            disabled={cruushDisabled}
            aria-label={revokingCruush ? (isAlreadyMutual ? 'Removing mutual' : 'Unsending cruush') : isAlreadyMutual ? 'Remove mutual' : hasSentCruush ? 'Unsend cruush' : sendingCruush ? 'sending cruush' : 'send cruush'}
            style={{
              background: cruushDisabled
                ? undefined
                : hasRevocableCruush
                  ? 'var(--cruush-gradient-soft-28)'
                  : 'var(--cruush-gradient)',
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
