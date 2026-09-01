import CruushIconImage, { CruushIcon } from './CruushIconImage';
import { Button } from './ui/button';
import mapIconWhite from '../assets/ui-icons/map-white.png';

export type ProfileCruushState = 'available' | 'sending' | 'sent' | 'mutual';

export type ProfileActionTrioProps = {
  userName: string;
  cruushState: ProfileCruushState;
  onCruush: () => void;
  /** Incoming mutual rows show the state without offering a repeat cruush. */
  cruushDisabled?: boolean;
  /** Their privacy settings decide whether a message can be opened from here. */
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
 * The three controls every profile surface offers, each shown only when the
 * viewed person's privacy settings allow it: cruush, centre their pin, message.
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
  const sizeClass = SIZE_CLASSES[size];
  const cruushLabel = cruushState === 'mutual'
    ? cruushDisabled ? `Mutual with ${userName}` : `Remove mutual with ${userName}`
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
          background: cruushState === 'available' || cruushTone === 'bright'
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
          style={{ background: canCenterPin ? 'var(--cruush-gradient)' : 'var(--cruush-gradient-soft-28), #0A0A12' }}
          aria-label={canCenterPin
            ? `Center the map on ${userName}`
            : `${userName} does not share their precise location`}
          title={canCenterPin
            ? `Center the map on ${userName}`
            : `${userName} does not share their precise location`}
          disabled={!canCenterPin}
          onClick={onCenterPin}
        >
          <CruushIconImage src={mapIconWhite} className={`h-7 w-7 ${canCenterPin ? '' : 'opacity-45'}`} />
        </Button>
      ) : null}

      {onMessage ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={`cruush-action-sheen ${sizeClass} shrink-0 rounded-full border-0 text-white disabled:opacity-100`}
          style={{ background: canMessage ? 'var(--cruush-gradient)' : 'var(--cruush-gradient-soft-28), #0A0A12' }}
          aria-label={canMessage ? `Message ${userName}` : `${userName} is not accepting messages from you`}
          title={canMessage ? `Message ${userName}` : `${userName} is not accepting messages from you`}
          disabled={!canMessage}
          onClick={onMessage}
        >
          <CruushIcon name="send" className={`h-6 w-6 ${canMessage ? '' : 'opacity-45'}`} variant="white" />
        </Button>
      ) : null}
    </div>
  );
}
