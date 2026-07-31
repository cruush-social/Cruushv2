import type { ReactNode } from 'react';
import { useId } from 'react';
import { resolveMediaUrl } from '../lib/apiClient';
import { HEART_PIN_PATH, HEART_PIN_THEMES, type HeartPinTheme } from '../lib/heartPin';
import { getProfileGradientStops } from '../lib/profileGradient';

interface HeartPhotoProps {
  borderColor?: string;
  className?: string;
  fallback?: ReactNode;
  label: string;
  masked?: boolean;
  photo?: string | null;
  theme?: HeartPinTheme;
  userId?: string | null;
}

export default function HeartPhoto({
  borderColor,
  className = '',
  fallback = null,
  label,
  masked = false,
  photo = null,
  theme = 'nearby',
  userId = null,
}: HeartPhotoProps) {
  const id = useId();
  const patternId = `heart-photo-${id}`;
  const gradientId = `heart-gradient-${id}`;
  const resolvedTheme = HEART_PIN_THEMES[theme];
  const showPhoto = Boolean(photo && !masked);
  const gradientStops = userId && !showPhoto ? getProfileGradientStops(userId) : resolvedTheme.stops;
  const resolvedBorderColor = borderColor ?? resolvedTheme.border;
  const resolvedPhoto = showPhoto && photo ? resolveMediaUrl(photo) : null;

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
          {resolvedPhoto ? (
            <pattern id={patternId} width="1" height="1">
              <image href={resolvedPhoto} width="64" height="64" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ) : null}
          <linearGradient id={gradientId} x1="10" y1="9" x2="55" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={gradientStops[0]} />
            <stop offset="52%" stopColor={gradientStops[1]} />
            <stop offset="100%" stopColor={gradientStops[2]} />
          </linearGradient>
        </defs>
        <path
          d={HEART_PIN_PATH}
          fill={resolvedPhoto ? `url(#${patternId})` : `url(#${gradientId})`}
          stroke={resolvedBorderColor}
          strokeWidth="3.2"
        />
      </svg>

      {!resolvedPhoto && fallback ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {fallback}
        </div>
      ) : null}
    </div>
  );
}
