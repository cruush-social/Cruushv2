import { useId } from 'react';
import dlModeBalaclavaHalo from '../assets/ui-icons/dl-mode-balaclava-halo-user-supplied.png';

export default function DlModeMark({
  active,
  className = 'h-6 w-6',
  svgBounds,
}: {
  active: boolean;
  className?: string;
  svgBounds?: { x: number; y: number; width: number; height: number };
}) {
  const id = useId().replace(/:/g, '');
  const maskId = `dl-mode-balaclava-halo-${id}`;
  const gradientId = `dl-mode-gradient-${id}`;

  return (
    <svg
      aria-hidden="true"
      {...svgBounds}
      className={`inline-block shrink-0 overflow-visible ${className}`}
      data-source="Julien supplied balaclava halo DL Mode icon"
      data-testid="dl-mode-mark"
      data-tone={active ? 'gradient' : 'white'}
      viewBox="0 0 1100 1430"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          style={{ maskType: 'alpha' }}
          x="0"
          y="0"
          width="1100"
          height="1430"
        >
          <image
            data-dl-mode-part="balaclava-halo"
            height="1430"
            href={dlModeBalaclavaHalo}
            preserveAspectRatio="xMidYMid meet"
            width="1100"
          />
        </mask>
        <linearGradient id={gradientId} x1="120" x2="980" y1="120" y2="1310" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFB6C1" />
          <stop offset="100%" stopColor="#FF00FF" />
        </linearGradient>
      </defs>
      <rect
        data-dl-mode-part="fill"
        fill={active ? `url(#${gradientId})` : '#ffffff'}
        height="1430"
        mask={`url(#${maskId})`}
        width="1100"
      />
    </svg>
  );
}
