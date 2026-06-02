import type { ReactNode } from 'react';
import { useId } from 'react';

interface HeartPhotoProps {
  borderColor?: string;
  className?: string;
  fallback?: ReactNode;
  label: string;
  photo?: string | null;
  theme?: 'current' | 'mutual' | 'nearby';
}

const HEART_PATH =
  'M32 56C30.55 54.67 8 39.75 8 23.75C8 14.95 13.95 8 22 8C27.05 8 30.2 10.78 32 14.05C33.8 10.78 36.95 8 42 8C50.05 8 56 14.95 56 23.75C56 39.75 33.45 54.67 32 56Z';

const HEART_THEME = {
  current: {
    border: '#0BA8FF',
    stops: ['#00B8FF', '#0A7DF4', '#3236D4'],
  },
  mutual: {
    border: '#6f00ff',
    stops: ['#A64DFF', '#6f00ff', '#3B00A8'],
  },
  nearby: {
    border: '#FF0072',
    stops: ['#FF0072', '#DA045D', '#B40849'],
  },
} as const;

export default function HeartPhoto({
  borderColor,
  className = '',
  fallback = null,
  label,
  photo = null,
  theme = 'nearby',
}: HeartPhotoProps) {
  const id = useId();
  const patternId = `heart-photo-${id}`;
  const gradientId = `heart-gradient-${id}`;
  const resolvedTheme = HEART_THEME[theme];
  const resolvedBorderColor = borderColor ?? resolvedTheme.border;

  return (
    <div className={`relative aspect-square ${className}`.trim()}>
      <svg
        aria-label={label}
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width="71"
        height="71"
        viewBox="0 0 64 64"
        className="h-full w-full"
      >
        <defs>
          {photo ? (
            <pattern id={patternId} width="1" height="1">
              <image href={photo} width="64" height="64" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ) : null}
          <linearGradient id={gradientId} x1="10" y1="9" x2="55" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={resolvedTheme.stops[0]} />
            <stop offset="52%" stopColor={resolvedTheme.stops[1]} />
            <stop offset="100%" stopColor={resolvedTheme.stops[2]} />
          </linearGradient>
        </defs>
        <path
          d={HEART_PATH}
          fill={photo ? `url(#${patternId})` : `url(#${gradientId})`}
          stroke={resolvedBorderColor}
          strokeWidth="3.2"
        />
      </svg>

      {!photo && fallback ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {fallback}
        </div>
      ) : null}
    </div>
  );
}
