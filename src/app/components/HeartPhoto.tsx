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
        viewBox="0 0 100 100"
        className="h-full w-full"
        style={{ filter: 'drop-shadow(0 0 10px rgba(209, 31, 58, 0.22))' }}
      >
        <defs>
          {photo ? (
            <pattern id={patternId} width="1" height="1">
              <image href={photo} width="100" height="100" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ) : null}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d11f3a" />
            <stop offset="50%" stopColor="#9f1730" />
            <stop offset="100%" stopColor="#690f1f" />
          </linearGradient>
        </defs>
        <path
          d="M50,90 C50,90 10,60 10,35 C10,20 20,10 30,10 C40,10 50,20 50,20 C50,20 60,10 70,10 C80,10 90,20 90,35 C90,60 50,90 50,90 Z"
          fill={photo ? `url(#${patternId})` : `url(#${gradientId})`}
          stroke={photo ? 'rgba(255, 255, 255, 0.88)' : 'none'}
          strokeWidth={photo ? '2' : '0'}
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
