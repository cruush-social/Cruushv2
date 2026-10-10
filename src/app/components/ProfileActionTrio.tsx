import CruushIconImage, { CruushIcon } from './CruushIconImage';
import { Button } from './ui/button';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import { useMapServiceArea } from './MapServiceAreaContext';

export type ProfileCruushState = 'available' | 'sending' | 'sent' | 'mutual';

export type ProfileActionTrioProps = {
  userName: string;
  cruushState: ProfileCruushState;
  onCruush: () => void;
  /** Incoming mutual rows show the state without offering a repeat cruush. */
  cruushDisabled?: boolean;
  /** Their privacy settings decide whether sending is available in the opened conversation. */
  canMessage?: boolean;
  onMessage?: () => void;
  /** Their privacy settings decide whether their pin can be centred on the map. */
  canCenterPin?: boolean;
  onCenterPin?: () => void;
  /** Allow a non-available state to remain bright when a surface requires it. */
  cruushTone?: 'bright' | 'dark';
  /** A cruush already exists in one direction, so the double heart reads. */
  cruushReceived?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'size-10',
  md: 'h-12 w-12',
};

/**
 * The three controls every profile surface offers: cruush, centre their pin,
 * and open a message conversation. Sending permission belongs to the composer.
 */
export default function ProfileActionTrio({
  userName,
  cruushState,
  onCruush,
  cruushDisabled = false,
  canMessage = false,
  onMessage,
  canCenterPin = false,
  onCenterPin,
  cruushTone,
  size = 'md',
  className,
}: ProfileActionTrioProps) {
  const { profilePinsAllowed } = useMapServiceArea();
  const pinActionable = profilePinsAllowed && canCenterPin;
  const sizeClass = SIZE_CLASSES[size];
  const cruushLabel = cruushState === 'mutual'
    ? cruushDisabled ? `Mutual with ${userName}` : `Uncruush ${userName}`
    : cruushState === 'sent'
      ? `Unsend cruush to ${userName}`
      : cruushState === 'sending'
        ? `Sending cruush to ${userName}`
        : `Send cruush to ${userName}`;

  return (
    <div className={`flex shrink-0 items-center gap-2 ${className ?? ''}`} data-testid="profile-action-trio">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={`cruush-action-sheen ${sizeClass} shrink-0 rounded-full border-0 text-white disabled:opacity-100`}
        style={{
          opacity: cruushState !== 'sending' && (cruushState === 'mutual' || cruushDisabled) ? 0.5 : undefined,
          background: cruushState !== 'sending' && (cruushState === 'mutual' || cruushDisabled) ? 'var(--cruush-gradient)' : cruushTone === 'dark'
            ? 'var(--cruush-gradient-soft-28)'
            : (cruushState === 'available' && !cruushDisabled) || cruushTone === 'bright'
            ? 'var(--cruush-gradient)'
            : 'var(--cruush-gradient-soft-28)',
        }}
        aria-label={cruushLabel}
        title={cruushLabel}
        disabled={cruushDisabled || cruushState === 'sending'}
        onClick={onCruush}
        data-cruush-state={cruushState}
      >
        <CruushIcon name="mutual" className="h-6 w-6" variant="white" />
      </Button>

      {onCenterPin ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={`cruush-action-sheen ${sizeClass} shrink-0 rounded-full border-0 text-white disabled:opacity-100`}
          style={{ background: 'var(--cruush-gradient)', opacity: pinActionable ? undefined : 0.5 }}
          aria-label={!profilePinsAllowed
            ? 'Map location unavailable'
            : pinActionable
            ? `Center the map on ${userName}`
            : `${userName} does not share their precise location`}
          title={!profilePinsAllowed
            ? 'Map location unavailable'
            : pinActionable
            ? `Center the map on ${userName}`
            : `${userName} does not share their precise location`}
          disabled={!pinActionable}
          onClick={pinActionable ? onCenterPin : undefined}
        >
          <CruushIconImage src={mapIconWhite} className={`h-7 w-7 ${pinActionable ? '' : 'opacity-45'}`} />
        </Button>
      ) : null}

      {onMessage ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={`cruush-action-sheen ${sizeClass} shrink-0 rounded-full border-0 text-white disabled:opacity-100`}
          style={{ background: 'var(--cruush-gradient)', opacity: canMessage ? undefined : 0.5 }}
          aria-label={canMessage ? `Message ${userName}` : `${userName} is not accepting messages from you`}
          title={canMessage ? `Message ${userName}` : `${userName} is not accepting messages from you`}
          onClick={onMessage}
        >
          <CruushIcon name="send" className={`h-6 w-6 ${canMessage ? '' : 'opacity-45'}`} variant="white" />
        </Button>
      ) : null}
    </div>
  );
}
