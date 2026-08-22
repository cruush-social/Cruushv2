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
  /** Force the quiet gradient, for example on cruushes you sent. */
  cruushTone?: 'bright' | 'dark';
  size?: 'sm' | 'md';
  className?: string;
};

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'size-9',
  md: 'h-11 w-11',
};

/**
 * The three controls every profile surface offers, each shown only when the
 * viewed person's privacy settings allow it: cruush, message, centre their pin.
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
        className={`${sizeClass} shrink-0 rounded-full border-0 text-white transition hover:brightness-110 disabled:opacity-100`}
        style={{
          background: cruushTone === 'dark' || cruushState === 'sent' || cruushState === 'sending'
            ? 'var(--cruush-gradient-soft-28)'
            : 'var(--cruush-gradient)',
        }}
        aria-label={cruushLabel}
        title={cruushLabel}
        disabled={cruushDisabled || cruushState === 'sending'}
        onClick={onCruush}
        data-cruush-state={cruushState}
      >
        <CruushIcon
          name={cruushState === 'mutual' || cruushState === 'sent' ? 'safety' : 'cruush'}
          className="h-5 w-5"
          variant="white"
        />
      </Button>

      {canMessage && onMessage ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={`${sizeClass} shrink-0 rounded-full border-0 text-white transition hover:brightness-110`}
          style={{ background: 'var(--cruush-gradient)' }}
          aria-label={`Message ${userName}`}
          title={`Message ${userName}`}
          onClick={onMessage}
        >
          <CruushIcon name="messages" className="h-5 w-5" variant="white" />
        </Button>
      ) : null}

      {canCenterPin && onCenterPin ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={`${sizeClass} shrink-0 rounded-full border-0 text-white transition hover:brightness-110`}
          style={{ background: 'var(--cruush-gradient)' }}
          aria-label={`Center the map on ${userName}`}
          title={`Center the map on ${userName}`}
          onClick={onCenterPin}
        >
          <CruushIconImage src={mapIconWhite} className="h-5 w-5" />
        </Button>
      ) : null}
    </div>
  );
}
