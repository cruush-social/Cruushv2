import DlModeMark from './DlModeMark';
import { getNsfwPhotoRestrictionLabel, type NsfwPhotoRestriction } from '../lib/dlMode';

/** One scalable cover for censored photos, including compact heart thumbnails. */
export default function DlModePhotoPlaceholder({ className = 'w-20', showLabel = true, restriction }: { className?: string; showLabel?: boolean; restriction?: NsfwPhotoRestriction }) {
  const label = getNsfwPhotoRestrictionLabel(restriction) ?? 'DL MODE ON';
  return (
    <svg
      aria-label={label}
      role="img"
      data-testid="dl-mode-photo-placeholder"
      className={`shrink-0 text-white opacity-75 ${restriction ? 'overflow-visible ' : ''}${className}`}
      viewBox={showLabel ? '0 0 80 76' : '20 0 40 52'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <foreignObject x="20" y="0" width="40" height="52">
        <DlModeMark active={false} className="h-full w-full" />
      </foreignObject>
      {showLabel ? <text x="40" y="68" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="500">{label}</text> : null}
    </svg>
  );
}
