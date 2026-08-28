import { useId } from 'react';

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
          <stop offset="6%" stopColor="#ff0072" />
          <stop offset="53%" stopColor="#6f00ff" />
          <stop offset="81%" stopColor="#3826ff" />
          <stop offset="100%" stopColor="#1181ff" />
        </linearGradient>
      </defs>
      <path
        clipRule="evenodd"
        d="M128,4 C128,4 214,76 214,144 V216 A10,10 0 0 1 204,226 H52 A10,10 0 0 1 42,216 V144 C42,76 128,4 128,4 Z M128,66 A44,44 0 0 0 107,148 L94,198 A7,7 0 0 0 101,206 H155 A7,7 0 0 0 162,198 L149,148 A44,44 0 0 0 128,66 Z"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M96,110 C106,92 150,92 160,110 C150,128 106,128 96,110 Z M128,98 A12,12 0 1 0 128,122 A12,12 0 1 0 128,98 Z"
        fillRule="evenodd"
      />
    </svg>
  );
}
