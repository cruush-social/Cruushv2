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
 * A bandana, on the diagonal the way it hangs, reduced to what still reads at
 * the size of a badge chip: the colour, a paisley band inset from the edges,
 * and a couple of loose drops in the field.
 *
 * The band is drawn as actual paisley commas rather than beads. A dashed line
 * reads as a dashed line, and the whole point of a hanky is that it looks like
 * a hanky.
 */

/** The paisley comma: a teardrop that curls back on itself. */
const PAISLEY_COMMA = 'M0 0c2.7-.2 4.6 1.5 4.9 3.9.3 2.7-1.6 4.8-4.4 5-1.6.1-2.8-.7-2.9-1.9-.1-1 .5-1.7 1.4-1.8';

function Paisley({ x, y, rotate, scale = 1, opacity = 0.95, seed = false }: {
  x: number;
  y: number;
  rotate: number;
  scale?: number;
  opacity?: number;
  /** The dot inside the curl, which is what makes it read as paisley. */
  seed?: boolean;
}) {
  return (
    <g opacity={opacity} transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d={PAISLEY_COMMA} fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="1.7" />
      {seed ? <circle cx="0.9" cy="4.4" fill="#fff" r="1.3" /> : null}
    </g>
  );
}

/** A row of commas along one edge of the inset square, before rotation. */
function PaisleyBand({ side }: { side: number }) {
  const commas = [-13.5, -4.5, 4.5, 13.5];

  return (
    <g transform={`rotate(${side} 32 32)`}>
      {commas.map((offset) => (
        <Paisley key={offset} rotate={90} scale={0.62} x={32 + offset} y={13.5} />
      ))}
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
      <g transform="rotate(45 32 32)">
        {/* The cloth. */}
        <rect fill={color} height="45" rx="2.5" width="45" x="9.5" y="9.5" />

        {/* Two rules with the comma band running between them. */}
        <rect
          fill="none"
          height="37"
          stroke="#fff"
          strokeOpacity="0.92"
          strokeWidth="1.5"
          width="37"
          x="13.5"
          y="13.5"
        />
        <rect
          fill="none"
          height="27"
          stroke="#fff"
          strokeOpacity="0.6"
          strokeWidth="1.1"
          width="27"
          x="18.5"
          y="18.5"
        />
        {[0, 90, 180, 270].map((side) => (
          <PaisleyBand key={side} side={side} />
        ))}

        {/* Two big drops in the middle field, facing each other. */}
        <Paisley rotate={-30} scale={1.15} seed x={27} y={27} />
        <Paisley rotate={150} scale={1.15} seed x={38} y={38} />

        {/* A hemmed edge, so a pale colour still has a boundary. */}
        <rect
          fill="none"
          height="45"
          rx="2.5"
          stroke="rgba(0,0,0,0.36)"
          strokeWidth="1.5"
          width="45"
          x="9.5"
          y="9.5"
        />
      </g>
    </svg>
  );
}
