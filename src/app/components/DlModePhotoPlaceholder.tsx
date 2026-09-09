import DlModeMark from './DlModeMark';

/** One scalable cover for censored photos, including compact heart thumbnails. */
export default function DlModePhotoPlaceholder({ className = 'w-20' }: { className?: string }) {
  return (
    <svg
      aria-label="DL MODE ON"
      role="img"
      data-testid="dl-mode-photo-placeholder"
      className={`shrink-0 text-white opacity-75 ${className}`}
      viewBox="0 0 80 76"
      xmlns="http://www.w3.org/2000/svg"
    >
      <foreignObject x="20" y="0" width="40" height="52">
        <DlModeMark active={false} className="h-full w-full" />
      </foreignObject>
      <text x="40" y="68" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="500">DL MODE ON</text>
    </svg>
  );
}
