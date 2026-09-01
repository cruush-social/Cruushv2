import { useId } from 'react';
import { DARK_ROOM_PALETTE } from '../lib/darkRoomPalette';

export const DARK_ROOM_CHAPEL_PATH = 'M128,4 C128,4 214,76 214,144 V216 A10,10 0 0 1 204,226 H52 A10,10 0 0 1 42,216 V144 C42,76 128,4 128,4 Z';
export const DARK_ROOM_KEYHOLE_PATH = 'M128,66 A44,44 0 0 0 107,148 L94,198 A7,7 0 0 0 101,206 H155 A7,7 0 0 0 162,198 L149,148 A44,44 0 0 0 128,66 Z';
export const DARK_ROOM_EYE_PATH = 'M96,110 C106,92 150,92 160,110 C150,128 106,128 96,110 Z M128,98 A12,12 0 1 0 128,122 A12,12 0 1 0 128,98 Z';
export const DARK_ROOM_HOUSING_PATH = `${DARK_ROOM_CHAPEL_PATH} ${DARK_ROOM_KEYHOLE_PATH}`;

export function DarkRoomKeyholeEyeGraphic({
  eyeFill,
  showEye = true,
}: {
  eyeFill: string;
  showEye?: boolean;
}) {
  return (
    <>
      <path
        d={DARK_ROOM_KEYHOLE_PATH}
        data-dark-room-part="keyhole"
        fill="#000000"
        fillOpacity={1}
      />
      {showEye ? (
        <path
          clipRule="evenodd"
          d={DARK_ROOM_EYE_PATH}
          data-dark-room-part="eye"
          fill={eyeFill}
          fillRule="evenodd"
        />
      ) : null}
    </>
  );
}

/** Approved keyhole-eye mark inside its pointed gothic-lancet chapel housing. */
export default function DarkRoomMark({
  active,
  className = '',
}: {
  active: boolean;
  className?: string;
}) {
  const gradientId = `dark-room-gradient-${useId().replace(/:/g, '')}`;
  const fill = active ? `url(#${gradientId})` : '#ffffff';

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill={fill}
      viewBox="30 0 196 236"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="42" x2="214" y1="4" y2="226" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={DARK_ROOM_PALETTE.dark} />
          <stop offset="50%" stopColor={DARK_ROOM_PALETTE.middle} />
          <stop offset="100%" stopColor={DARK_ROOM_PALETTE.light} />
        </linearGradient>
      </defs>
      <path
        clipRule="evenodd"
        d={DARK_ROOM_HOUSING_PATH}
        data-dark-room-part="housing"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d={DARK_ROOM_EYE_PATH}
        data-dark-room-part="eye"
        fillRule="evenodd"
      />
    </svg>
  );
}
