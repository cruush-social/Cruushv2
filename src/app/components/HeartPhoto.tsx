import type { ReactNode } from 'react';
import { useId } from 'react';

interface HeartPhotoProps {
  className?: string;
  fallback?: ReactNode;
  label: string;
  photo?: string | null;
}

export default function HeartPhoto({ className = '', fallback = null, label, photo = null }: HeartPhotoProps) {
  const id = useId();
  const patternId = `heart-photo-${id}`;
  const gradientId = `heart-gradient-${id}`;

  return (
    <div className={`relative aspect-square ${className}`.trim()}>
      <svg
        aria-label={label}
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width="71"
        height="71"
        viewBox="0 0 71 71"
        className="h-full w-full"
        style={{ filter: 'drop-shadow(0 0 16px rgba(255, 0, 114, 0.55))' }}
      >
        <defs>
          {photo ? (
            <pattern id={patternId} width="1" height="1">
              <image href={photo} width="71" height="71" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ) : null}
          <linearGradient id={gradientId} x1="16" y1="16" x2="54.4" y2="54.4" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF0072" />
            <stop offset="48.5577%" stopColor="#DA045D" />
            <stop offset="100%" stopColor="#B40849" />
          </linearGradient>
        </defs>
        <path
          d="M35.2 54.4C35.2 54.4 16 40 16 28C16 20.8 20.8 16 25.6 16C30.4 16 35.2 20.8 35.2 20.8C35.2 20.8 40 16 44.8 16C49.6 16 54.4 20.8 54.4 28C54.4 40 35.2 54.4 35.2 54.4Z"
          fill={photo ? `url(#${patternId})` : `url(#${gradientId})`}
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
