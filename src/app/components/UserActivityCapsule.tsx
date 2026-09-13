/**
 * Protected cruush presentation and behavior.
 * Do not change artwork, geometry, styling, content, controls, privacy rules,
 * interactions, animation sequences or timing unless Julien explicitly requests
 * that exact change in a user prompt. Improvement, cleanup and consistency are
 * not authorization. Preserve the approved local appearance and functionality.
 */

import type { KeyboardEvent, ReactNode } from 'react';
import { resolveVibeTone, vibeCapsuleStyle } from '../lib/vibeTone';
import type { SideBadges } from '../lib/profileApi';
import SideBadgePair, { type SideBadgeTone } from './SideBadgePair';

export type UserActivityCapsuleProps = {
  heart: ReactNode;
  sideBadges?: SideBadges | null;
  sideBadgeTone?: SideBadgeTone;
  heartActions?: ReactNode;
  name: ReactNode;
  pronouns?: ReactNode;
  identityAdornment?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  mutual?: boolean;
  /** Vibe capsules, shown above the card body on every surface. */
  vibes?: string[];
  vibeTone?: 'current' | 'mutual' | 'nearby';
  content?: ReactNode;
  cornerAction?: ReactNode;
  /** A single control pinned to the card's own top-right corner, separate from `actions`. */
  cornerBadge?: ReactNode;
  onOpenIdentity?: () => void;
  identityDisabled?: boolean;
  onSelect?: () => void;
  selected?: boolean;
  selectLabel?: string;
  compactIdentityMeta?: boolean;
  className?: string;
  testId?: string;
};

/** Shared person-list capsule for Cruushes, Messages, and Feed. */
export default function UserActivityCapsule({
  heart,
  sideBadges,
  heartActions,
  name,
  pronouns,
  identityAdornment,
  metadata,
  actions,
  mutual = false,
  sideBadgeTone = mutual ? 'mutual' : 'nearby',
  vibes,
  vibeTone = 'nearby',
  content,
  cornerAction,
  cornerBadge,
  onOpenIdentity,
  identityDisabled = false,
  onSelect,
  selected = false,
  selectLabel,
  compactIdentityMeta = false,
  className,
  testId = 'user-activity-capsule',
}: UserActivityCapsuleProps) {
  const identity = (
    <div className="cruush-user-activity-identity flex min-w-0 flex-nowrap items-baseline gap-x-2 overflow-hidden">
      {/* The name keeps a floor and the pronouns give way instead. With both
          free to shrink, long pronouns plus badges squeezed the name to zero
          width, and rows read as having no name at all. The container clips,
          so a long pair can never spill under the action buttons. */}
      <span className="cruush-user-activity-name min-w-[3.5rem] shrink-[0.25] truncate text-base text-white">{name}</span>
      {pronouns ? <span className="cruush-user-activity-pronouns min-w-0 shrink truncate text-sm text-white/62">{pronouns}</span> : null}
      {identityAdornment}
    </div>
  );

  const handleSelectKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !onSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onSelect();
  };

  const identityControl = onOpenIdentity ? (
    <button
      type="button"
      className={compactIdentityMeta ? 'min-w-0 text-left' : 'col-start-2 col-end-4 min-w-0 text-left'}
      disabled={identityDisabled}
      onClick={(event) => {
        if (onSelect) event.stopPropagation();
        onOpenIdentity();
      }}
    >
      {identity}
    </button>
  ) : (
    <div className={compactIdentityMeta ? 'min-w-0' : 'col-start-2 col-end-4 min-w-0'}>{identity}</div>
  );


  const vibeRow = (vibes?.length ?? 0) > 0 ? (
    /* Above the card's grid, not inside it, so the heart, name and actions
       keep the layout they already had. Full width for the tags, one line
       always: each tag keeps its own width so the ones that show stay
       readable, and the row clips at the card edge rather than wrapping. */
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden" data-testid="activity-vibes">
      {vibes?.slice(0, 3).map((vibe) => (
        <span
          className="max-w-full flex-shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px] uppercase leading-tight tracking-[0.08em]"
          key={vibe}
          style={vibeCapsuleStyle(resolveVibeTone({
            mutual: vibeTone === 'mutual',
            isCurrentUser: vibeTone === 'current',
          }))}
        >
          {vibe}
        </span>
      ))}
    </div>
  ) : null;

  return (
    <div className="cruush-user-activity-shell w-full">
      <article
        aria-label={onSelect ? selectLabel : undefined}
        aria-pressed={onSelect ? selected : undefined}
        className={`cruush-user-activity-capsule relative flex w-full flex-col border bg-card/70 text-left shadow-[0_12px_32px_rgba(0,0,0,0.24)] transition-colors ${selected ? 'border-[#8B5CF6] bg-[#8B5CF6]/18' : 'border-white/10 hover:bg-white/[0.06]'} ${onSelect ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/70' : ''} ${className ?? ''}`}
        data-testid={testId}
        onClick={onSelect}
        onKeyDown={handleSelectKeyDown}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
      >
      {cornerBadge ? (
        <div className="absolute right-2 top-2 z-10" data-testid="activity-corner-badge">
          {cornerBadge}
        </div>
      ) : null}

      {vibeRow ? <div className="mb-2 min-w-0">{vibeRow}</div> : null}

      <div className="cruush-user-activity-grid grid w-full items-center">
      <div className={`cruush-user-activity-heart flex flex-col items-center ${compactIdentityMeta ? 'row-start-1 self-center' : 'row-span-4 self-start'}`}>
        {heart}
        <SideBadgePair badges={sideBadges} tone={sideBadgeTone} />
        {heartActions}
      </div>

      {compactIdentityMeta ? (
        <div className="col-start-2 row-start-1 min-w-0 self-center">
          {identityControl}
          {metadata ? <div className="cruush-user-activity-metadata min-w-0 overflow-hidden">{metadata}</div> : null}
        </div>
      ) : (
        <>
          {identityControl}
          {metadata ? <div className="cruush-user-activity-metadata col-start-2 min-w-0 self-center overflow-hidden">{metadata}</div> : null}
        </>
      )}

      {actions ? <div className={`cruush-user-activity-actions col-start-3 self-center ${compactIdentityMeta ? 'row-start-1' : 'row-start-2'}`}>{actions}</div> : null}

      {content ? <div className="cruush-user-activity-content col-start-2 col-end-4 min-w-0">{content}</div> : null}
      </div>
      {/* A footer row in the card's own flow rather than a pinned overlay, so
          the trash, expiry, and report controls sit in the lower-right corner
          without ever covering the name, metadata, or post text. */}
      {cornerAction ? (
        <div className="cruush-user-activity-corner mt-1 flex w-full items-center justify-end gap-1" data-testid="activity-corner-action">
          {cornerAction}
        </div>
      ) : null}
      </article>
    </div>
  );
}
