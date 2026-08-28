import { useId } from 'react';
import darkRoomColored from '../assets/ui-icons/dl-mode-colored.png';
import darkRoomWhite from '../assets/ui-icons/dl-mode-white.png';

/** Approved Dark Room mask with the halo and forehead-wing cutouts. */
export default function DarkRoomMark({
  active,
  className = '',
}: {
  active: boolean;
  className?: string;
}) {
  const maskId = `dark-room-wings-${useId()}`;

  return (
    <svg
      aria-hidden="true"
      className={`overflow-visible ${className}`.trim()}
      viewBox="0 0 24 24"
    >
      <defs>
        <mask id={maskId}>
          <rect fill="#ffffff" height="24" width="24" x="0" y="0" />
          <g fill="#000000" transform="translate(12 5.9) scale(0.82) translate(-12 -8.3)">
            <path d="M11.98 8.3c-.62-1.5-1.72-2.5-3.28-2.94.06 1.02.42 1.86 1.06 2.5-.72-.1-1.34-.4-1.86-.9.12 1.24.86 2.1 2.16 2.5.64.02 1.26-.02 1.92-.16Z" />
            <path d="M12.02 8.3c.62-1.5 1.72-2.5 3.28-2.94-.06 1.02-.42 1.86-1.06 2.5.72-.1 1.34-.4 1.86-.9-.12 1.24-.86 2.1-2.16 2.5-.64.02-1.26-.02-1.92-.16Z" />
          </g>
        </mask>
      </defs>
      <image
        height="24"
        href={active ? darkRoomColored : darkRoomWhite}
        mask={`url(#${maskId})`}
        width="24"
      />
      <ellipse
        cx="12"
        cy="2.9"
        fill="none"
        rx="6.5"
        ry="2.05"
        stroke="currentColor"
        strokeWidth="1.5"
        transform="rotate(-13 12 2.9)"
      />
    </svg>
  );
}
