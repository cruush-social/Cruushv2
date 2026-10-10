import { showPurgatoryPresentation } from '../lib/purgatoryPresentation';
import { getNsfwPhotoRestrictionLabel, type NsfwPhotoRestriction } from '../lib/dlMode';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import DlModeMark from './DlModeMark';
import { useId } from 'react';
import profileEditIconWhite from '../assets/ui-icons/humanity-profile-selected-winged-heart-symmetric.png';
import { resolveMediaUrl } from '../lib/apiClient';
import { HEART_PIN_PATH, HEART_PIN_THEMES, type HeartPinTheme } from '../lib/heartPin';
import { getProfileGradientStops } from '../lib/profileGradient';
import MileHighContrail from './MileHighContrail';
import { USER_BORDER_COLORS, type UserBorderTone } from '../lib/userBorderTone';
import purgatoryHeartOverlay from '../assets/ui-icons/purgatory-heart-pin-overlay.svg';

interface HeartPhotoProps {
  borderColor?: string;
  borderTone?: UserBorderTone;
  staticMileHigh?: boolean;
  hideMileHighContrail?: boolean;
  className?: string;
  fallback?: ReactNode;
  hideDefaultMark?: boolean;
  label: string;
  masked: boolean;
  restriction?: NsfwPhotoRestriction;
  photo?: string | null;
  outOfSight?: boolean;
  theme?: HeartPinTheme;
  userId?: string | null;
  onClick?: () => void;
}

export default function HeartPhoto({
  borderColor,
  borderTone,
  staticMileHigh = false,
  hideMileHighContrail = false,
  className = '',
  fallback = null,
  hideDefaultMark = false,
  label,
  masked: dlMasked,
  restriction,
  photo = null,
  outOfSight = false,
  theme = 'nearby',
  userId = null,
  onClick,
}: HeartPhotoProps) {
  const id = useId();
  const masked = dlMasked || Boolean(restriction);
  const patternId = `heart-photo-${id}`;
  const gradientId = `heart-gradient-${id}`;
  const resolvedTheme = HEART_PIN_THEMES[theme];
  const showMileHighContrail = staticMileHigh || borderTone === 'mile-high';
  const showPhoto = Boolean(photo && !masked);
  const gradientStops = userId && !showPhoto && theme !== 'current' ? getProfileGradientStops(userId) : resolvedTheme.stops;
  const resolvedBorderColor = borderColor
    ?? (staticMileHigh ? USER_BORDER_COLORS['mile-high'] : borderTone ? USER_BORDER_COLORS[borderTone] : resolvedTheme.border);
  const resolvedPhoto = showPhoto && photo ? resolveMediaUrl(photo) : null;
  const handleClick = onClick
    ? (event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }
    : undefined;
  const handleKeyDown = onClick
    ? (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onClick();
      }
    : undefined;

  return (
    <div
      className={`relative aspect-square ${onClick ? 'cursor-pointer' : ''} ${className}`.trim()}
      data-border-tone={showMileHighContrail ? 'mile-high' : borderTone}
      data-heart-theme={theme}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? label : undefined}
    >
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
          <linearGradient data-heart-fill-theme={theme} id={gradientId} x1="10" y1="9" x2="55" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={gradientStops[0]} />
            <stop offset="52%" stopColor={gradientStops[1]} />
            <stop offset="100%" stopColor={gradientStops[2]} />
          </linearGradient>
        </defs>
        <path
          d={HEART_PIN_PATH}
          fill={resolvedPhoto ? `url(#${patternId})` : `url(#${gradientId})`}
          stroke={resolvedBorderColor}
          strokeOpacity={1}
          strokeWidth="3.2"
        />
        {/* Heart previews omit the DL text line. Missing photos keep their
            existing cruush mark; masked photos never get a competing fallback. */}
        {!resolvedPhoto ? (
          masked ? (
            <g role="img" aria-label={getNsfwPhotoRestrictionLabel(restriction) ?? 'DL MODE ON'} data-testid="dl-mode-photo-placeholder" className="opacity-75">
              <DlModeMark active={false} className="" svgBounds={{ x: 22, y: 19, width: 20, height: 26 }} />
            </g>
          ) : hideDefaultMark ? null : (
            <image
              href={profileEditIconWhite}
              width="26"
              height="26"
              x="19"
              y="21"
              opacity={0.2}
              preserveAspectRatio="xMidYMid meet"
            />
          )
        ) : null}
        {showMileHighContrail && !hideMileHighContrail ? (
          <MileHighContrail
            gradientId={`${gradientId}-mile-high`}
            marker={{ id: patternId }}
          />
        ) : null}
      </svg>

      {!resolvedPhoto && !masked && fallback ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {fallback}
        </div>
      ) : null}
      {showPurgatoryPresentation(outOfSight, showMileHighContrail) ? (
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-0 -top-[12.5%] h-[112.5%] w-full"
          data-testid="purgatory-heart-overlay"
          src={purgatoryHeartOverlay}
        />
      ) : null}
    </div>
  );
}
