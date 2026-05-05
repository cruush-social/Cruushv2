import { useId } from 'react';

interface HeartPinProps {
  user: any;
}

export default function HeartPin({ user }: HeartPinProps) {
  const id = useId();
  const hasPhoto = Boolean(user.photo);
  const isCurrentUser = user.id === 'me' || user.isCurrentUser;
  const patternId = `heart-pin-photo-${id}`;
  const fillId = `heart-pin-fill-${id}`;
  const glow = isCurrentUser
    ? 'drop-shadow(0 0 16px #22B8FF)'
    : 'drop-shadow(0 0 16px rgba(209, 31, 58, 0.60))';
  const gradientStops = isCurrentUser
    ? ['#0099FF', '#1968EA', '#3236D4']
    : ['#FF0072', '#DA045D', '#B40849'];

  return (
    <div className="relative w-12 h-12">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="71"
        height="71"
        viewBox="0 0 71 71"
        fill="none"
        className="h-full w-full"
        style={{ filter: glow }}
      >
        <defs>
          {hasPhoto && (
            <pattern id={patternId} width="1" height="1">
              <image href={user.photo} width="71" height="71" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          )}
          <linearGradient id={fillId} x1="16" y1="16" x2="54.4" y2="54.4" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={gradientStops[0]} />
            <stop offset="48.5577%" stopColor={gradientStops[1]} />
            <stop offset="100%" stopColor={gradientStops[2]} />
          </linearGradient>
          <filter
            id={`heart-pin-shadow-${id}`}
            x="-4.8"
            y="-4.8"
            width="80"
            height="80"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset />
            <feGaussianBlur stdDeviation="8" />
            <feColorMatrix
              type="matrix"
              values={isCurrentUser
                ? '0 0 0 0 0.133333 0 0 0 0 0.721569 0 0 0 0 1 0 0 0 1 0'
                : '0 0 0 0 0.819608 0 0 0 0 0.121569 0 0 0 0 0.227451 0 0 0 0.6 0'}
            />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
          </filter>
        </defs>
        <g filter={`url(#heart-pin-shadow-${id})`}>
          <path
            d="M35.2 54.4C35.2 54.4 16 40 16 28C16 20.8 20.8 16 25.6 16C30.4 16 35.2 20.8 35.2 20.8C35.2 20.8 40 16 44.8 16C49.6 16 54.4 20.8 54.4 28C54.4 40 35.2 54.4 35.2 54.4Z"
            fill={hasPhoto ? `url(#${patternId})` : `url(#${fillId})`}
          />
        </g>
      </svg>

      {!hasPhoto && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: isCurrentUser
              ? 'radial-gradient(circle, rgba(34, 184, 255, 0.4), transparent)'
              : 'radial-gradient(circle, rgba(209, 31, 58, 0.4), transparent)',
            filter: 'blur(8px)',
          }}
        />
      )}
    </div>
  );
}
