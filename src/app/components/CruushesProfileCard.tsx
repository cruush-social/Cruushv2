import type { ReactNode } from 'react';
import type { CruushBadge as CruushBadgeKey } from '../lib/billingApi';
import type { DlModePhotoRelationship } from '../lib/dlMode';
import { getNsfwPhotoRestriction, shouldMaskPhoto, useDlMode } from '../lib/dlMode';
import type { SideBadges } from '../lib/profileApi';
import { resolveUserBorderTone } from '../lib/userBorderTone';
import CruushBadge from './CruushBadge';
import { CruushIcon } from './CruushIconImage';
import HeartPhoto from './HeartPhoto';
import UserActivityCapsule from './UserActivityCapsule';

export type CruushesProfileCardUser = {
  id: string;
  name: string;
  pronouns?: string;
  photo?: string | null;
  photoExplicit?: boolean;
  photoRelationship?: DlModePhotoRelationship;
  badges?: CruushBadgeKey[] | null;
  sideBadges?: SideBadges | null;
  travelling?: boolean;
  outOfSight?: boolean;
  vibes?: string[];
  isCurrentUser?: boolean;
  activePing?: unknown;
};

type CruushesProfileCardProps = {
  user: CruushesProfileCardUser;
  heartFallback?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  content?: ReactNode;
  identityAdornment?: ReactNode;
  cornerBadge?: ReactNode;
  cornerAction?: ReactNode;
  mutual?: boolean;
  sharesCrowd?: boolean;
  wrapVibes?: boolean;
  onOpenProfile?: () => void;
  onSelect?: () => void;
  selected?: boolean;
  selectLabel?: string;
  testId?: string;
};

/** The actual compact profile card used for unlocked people on Cruushes. */
export default function CruushesProfileCard({
  user,
  heartFallback = <CruushIcon name="cruush" className="h-6 w-6 opacity-30" />,
  metadata,
  actions,
  content,
  identityAdornment,
  cornerBadge,
  cornerAction,
  mutual = false,
  sharesCrowd = false,
  wrapVibes = false,
  onOpenProfile,
  onSelect,
  selected,
  selectLabel,
  testId,
}: CruushesProfileCardProps) {
  const dlModeActive = useDlMode();
  const photoRelationship = {
    ...user.photoRelationship,
    isMutualCruush: mutual,
    sharesCrowd: user.photoRelationship?.sharesCrowd ?? sharesCrowd,
  };
  const borderTone = resolveUserBorderTone({
    activePing: Boolean(user.activePing),
    current: user.isCurrentUser,
    mileHigh: user.travelling,
    mutual,
  });

  return (
    <UserActivityCapsule
      className="bg-black/72 hover:bg-black/86 min-h-[7.5rem] content-center"
      testId={testId}
      heart={(
        <HeartPhoto
          borderTone={borderTone}
          outOfSight={user.outOfSight === true}
          className="w-20 shrink-0"
          label={`${user.name} preview`}
          restriction={getNsfwPhotoRestriction(user.photoExplicit, photoRelationship)}
          masked={shouldMaskPhoto(dlModeActive, user.photoExplicit, photoRelationship)}
          photo={user.photo}
          userId={user.id}
          theme={mutual ? 'mutual' : 'nearby'}
          onClick={onOpenProfile}
          fallback={heartFallback}
        />
      )}
      name={user.name}
      pronouns={user.pronouns || 'ask me'}
      sideBadges={user.sideBadges}
      sideBadgeTone={borderTone}
      identityAdornment={(
        <>
          <CruushBadge badges={user.badges} compact />
          {identityAdornment}
        </>
      )}
      onOpenIdentity={onOpenProfile}
      metadata={metadata}
      actions={actions}
      cornerBadge={cornerBadge}
      cornerAction={cornerAction}
      content={content}
      mutual={mutual}
      vibes={user.vibes}
      vibeTone={mutual ? 'mutual' : user.isCurrentUser ? 'current' : 'nearby'}
      wrapVibes={wrapVibes}
      onSelect={onSelect}
      selected={selected}
      selectLabel={selectLabel}
    />
  );
}
