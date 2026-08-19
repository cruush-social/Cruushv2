import { Crown } from 'lucide-react';
import type { CruushBadge as CruushBadgeKey } from '../lib/billingApi';

function AdminDuckIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pictogrammers MDI Duck by Austin Andrews, Apache-2.0. */}
      <path d="M8.5,5A1.5,1.5 0 0,0 7,6.5A1.5,1.5 0 0,0 8.5,8A1.5,1.5 0 0,0 10,6.5A1.5,1.5 0 0,0 8.5,5M10,2A5,5 0 0,1 15,7C15,8.7 14.15,10.2 12.86,11.1C14.44,11.25 16.22,11.61 18,12.5C21,14 22,12 22,12C22,12 21,21 15,21H9C9,21 4,21 4,16C4,13 7,12 6,10C2,10 2,6.5 2,6.5C3,7 4.24,7 5,6.65C5.19,4.05 7.36,2 10,2Z" />
    </svg>
  );
}

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
        title="admin"
      >
        <AdminDuckIcon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        admin
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
