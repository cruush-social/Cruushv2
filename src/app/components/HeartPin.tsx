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
        </defs>
        <path
          d="M35.2 54.4C35.2 54.4 16 40 16 28C16 20.8 20.8 16 25.6 16C30.4 16 35.2 20.8 35.2 20.8C35.2 20.8 40 16 44.8 16C49.6 16 54.4 20.8 54.4 28C54.4 40 35.2 54.4 35.2 54.4Z"
          fill={hasPhoto ? `url(#${patternId})` : `url(#${fillId})`}
        />
      </svg>
    </div>
  );
}
