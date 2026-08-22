/**
 * A folded hanky, which is the one badge that carries no icon at all.
 *
 * The hanky code is a colour code. The cloth says nothing on its own and the
 * colour says everything, so this frame is the shape and the colour and nothing
 * else. It is the single place in the app where a badge is not flat white,
 * because a white hanky already means something specific and it is not "no
 * colour chosen".
 */

export type HankyColor = {
  id: string;
  label: string;
  /** What the colour means in the code, said plainly. */
  meaning: string;
  color: string;
};

export const HANKY_COLORS: HankyColor[] = [
  { id: 'black', label: 'Black', meaning: 'heavy play', color: '#1A1A1E' },
  { id: 'grey', label: 'Grey', meaning: 'bondage', color: '#9AA0A6' },
  { id: 'light-blue', label: 'Light blue', meaning: 'oral', color: '#7EC8F2' },
  { id: 'navy', label: 'Navy', meaning: 'anal', color: '#1F3A93' },
  { id: 'red', label: 'Red', meaning: 'fisting', color: '#D62828' },
  { id: 'dark-red', label: 'Dark red', meaning: 'heavy fisting', color: '#7A1220' },
  { id: 'yellow', label: 'Yellow', meaning: 'watersports', color: '#F2C230' },
  { id: 'orange', label: 'Orange', meaning: 'anything goes', color: '#F07818' },
  { id: 'purple', label: 'Purple', meaning: 'piercing', color: '#7A3CB8' },
  { id: 'lavender', label: 'Lavender', meaning: 'drag', color: '#C4A7E7' },
  { id: 'pink', label: 'Pink', meaning: 'toys', color: '#F06AA8' },
  { id: 'fuchsia', label: 'Fuchsia', meaning: 'spanking', color: '#C2185B' },
  { id: 'white', label: 'White', meaning: 'mutual', color: '#F4F6F8' },
  { id: 'beige', label: 'Beige', meaning: 'rimming', color: '#D9C3A0' },
  { id: 'charcoal', label: 'Charcoal', meaning: 'latex', color: '#3C4048' },
  { id: 'olive', label: 'Olive', meaning: 'uniform', color: '#6B7A3A' },
  { id: 'mustard', label: 'Mustard', meaning: 'size', color: '#C9A227' },
  { id: 'teal', label: 'Teal', meaning: 'CBT', color: '#1E8C8C' },
  { id: 'brown', label: 'Brown', meaning: 'scat, discuss first', color: '#6B4423' },
  { id: 'coral', label: 'Coral', meaning: 'feet', color: '#F58C7B' },
  { id: 'magenta', label: 'Magenta', meaning: 'armpit', color: '#B5179E' },
  { id: 'hunter-green', label: 'Hunter green', meaning: 'daddy or boy', color: '#2F5D3A' },
  { id: 'apricot', label: 'Apricot', meaning: 'chubby chaser', color: '#F2B279' },
  { id: 'denim', label: 'Denim', meaning: 'anything but', color: '#4A6FA5' },
];

/**
 * The bandana laid out as a diamond, the way it looks flat: the field in its
 * colour, a paisley band inset from the edges, and a few loose paisley drops in
 * the middle. At badge size the detail reads as texture rather than as pattern,
 * which is the point. Anyone who knows the code reads the colour.
 */

/** One paisley drop, drawn at the origin and placed by transform. */
const PAISLEY = 'M0 0c3 0 5 2.1 5 4.9 0 3-2.4 5.1-5.5 5.1-1.6 0-2.7-.9-2.7-2.1 0-1 .6-1.6 1.5-1.6';

function Paisley({ x, y, rotate, scale = 1 }: { x: number; y: number; rotate: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d={PAISLEY} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" />
      <circle cx="0.4" cy="4.6" fill="rgba(255,255,255,0.9)" r="1.1" />
    </g>
  );
}

export function HankyFrame({ className, color = '#D62828' }: { className?: string; color?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The cloth, on the diagonal. */}
      <path d="M32 2 62 32 32 62 2 32z" fill={color} />

      {/* The band, inset the way a bandana's border sits. */}
      <path
        d="M32 11 53 32 32 53 11 32z"
        fill="none"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="2.6"
      />
      <path
        d="M32 15.6 48.4 32 32 48.4 15.6 32z"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.4"
      />
      <path
        d="M32 6.6 57.4 32 32 57.4 6.6 32z"
        fill="none"
        stroke="rgba(0,0,0,0.34)"
        strokeWidth="1.4"
      />

      {/* Loose drops in the middle field. */}
      <Paisley rotate={-24} scale={0.78} x={27} y={26} />
      <Paisley rotate={152} scale={0.78} x={38} y={36} />
      <Paisley rotate={64} scale={0.6} x={32.5} y={20} />

      {/* Corners, where a bandana carries its heaviest print. */}
      <Paisley rotate={-45} scale={0.52} x={32} y={5.4} />
      <Paisley rotate={135} scale={0.52} x={32} y={54} />
    </svg>
  );
}
