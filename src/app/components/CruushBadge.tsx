import { Crown } from 'lucide-react';
import type { CruushBadge as CruushBadgeKey } from '../lib/billingApi';

type CruushBadgeProps = {
  badges?: CruushBadgeKey[] | null;
  compact?: boolean;
};

export default function CruushBadge({ badges, compact = false }: CruushBadgeProps) {
  const badgeList = badges ?? [];

  if (badgeList.includes('lifetime_founder')) {
    return (
      <span
        className={[
          'inline-flex items-center gap-1 rounded-full border border-amber-100/45 bg-amber-100/16 text-amber-100',
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        ].join(' ')}
        title="lifetime founder"
      >
        <Crown className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        lifetime
      </span>
    );
  }

  if (badgeList.includes('founder')) {
    return (
      <span
        className={[
          'inline-flex items-center gap-1 rounded-full border border-yellow-300/38 bg-yellow-300/13 text-yellow-100',
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        ].join(' ')}
        title="founder"
      >
        <Crown className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        founder
      </span>
    );
  }

  return null;
}
