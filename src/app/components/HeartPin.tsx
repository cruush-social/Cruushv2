import { useId } from 'react';
import { resolveMediaUrl } from '../lib/apiClient';
import { HEART_PIN_PATH, HEART_PIN_PHOTO_PATH, HEART_PIN_THEMES } from '../lib/heartPin';

interface HeartPinProps {
  user: any;
}

export default function HeartPin({ user }: HeartPinProps) {
  const id = useId();
  const resolvedPhoto = user.photo ? resolveMediaUrl(user.photo) : null;
  const hasPhoto = Boolean(resolvedPhoto);
  const isCurrentUser = user.id === 'me' || user.isCurrentUser;
  const isMutual = user.relationship?.kind === 'mutual_cruush' || user.mutual === true || user.mutualCruush === true;
  const clipId = `heart-pin-photo-clip-${id}`;
  const fillId = `heart-pin-fill-${id}`;
  const theme = isCurrentUser ? HEART_PIN_THEMES.current : isMutual ? HEART_PIN_THEMES.mutual : HEART_PIN_THEMES.nearby;

  return (
    <div className="relative w-12 h-12">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="71"
        height="71"
        viewBox="0 0 64 64"
        fill="none"
        className="cruush-heart-glass-svg h-full w-full"
        >
          <defs>
            {hasPhoto && (
              <clipPath id={clipId}>
                <path d={HEART_PIN_PHOTO_PATH} />
              </clipPath>
            )}
            <linearGradient id={fillId} x1="10" y1="9" x2="55" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={theme.stops[0]} />
            <stop offset="52%" stopColor={theme.stops[1]} />
            <stop offset="100%" stopColor={theme.stops[2]} />
          </linearGradient>
        </defs>
        <path
          className="cruush-heart-glass-base"
          d={HEART_PIN_PATH}
          fill={`url(#${fillId})`}
          stroke={theme.border}
          strokeWidth="3.2"
        />
        {hasPhoto ? (
          <image
            clipPath={`url(#${clipId})`}
            href={resolvedPhoto ?? ''}
            width="64"
            height="64"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : null}
        <path className="cruush-heart-glass-theme-border" d={HEART_PIN_PATH} stroke={theme.border} />
        <path className="cruush-heart-glass-rim" d={HEART_PIN_PATH} />
        <path className="cruush-heart-glass-edge cruush-heart-glass-edge-magenta" d={HEART_PIN_PATH} />
        <path className="cruush-heart-glass-edge cruush-heart-glass-edge-cyan" d={HEART_PIN_PATH} />
        <path className="cruush-heart-glass-lip" d={HEART_PIN_PATH} />
        <path className="cruush-heart-glass-specular" d={HEART_PIN_PATH} />
      </svg>
    </div>
  );
}
