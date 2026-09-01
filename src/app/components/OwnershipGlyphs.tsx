/**
 * The BDSM collar emblems, as the community already draws them.
 *
 * Three frames say where you stand: a shield holds a collar, a ring wears one,
 * and corner brackets wear none. The mark inside says whose gender is meant.
 * None of it says anything about position, because a top and a dominant are not
 * the same thing and this set is the reason that reads clearly.
 *
 * The community calls the ring "owned". We say collared, which is the same
 * arrangement in a word that is about the collar rather than about property.
 *
 * Every emblem is one filled shape with the inner mark knocked out, so it holds
 * in white on any background at the size a badge chip renders.
 */

type EmblemProps = {
  className?: string;
};

type InnerMark = 'plain' | 'female' | 'male' | 'nonbinary';

/** Marks are drawn around this point in all three frames. */
const MARK_CENTRE = { x: 12, y: 10.9 };

/**
 * The inner mark, as subpaths meant to be knocked out of a filled frame. Drawn
 * with the opposite winding so `evenodd` cuts them rather than filling them.
 */
function markPath(mark: InnerMark) {
  const { x, y } = MARK_CENTRE;

  if (mark === 'female') {
    // A plus, arms of even weight.
    return `M${x - 1.05} ${y - 3.6}h2.1v2.55h2.55v2.1h-2.55v2.55h-2.1v-2.55h-2.55v-2.1h2.55z`;
  }

  if (mark === 'male') {
    // An arrow pointing up, with a broad head.
    return `M${x} ${y - 4.1} ${x + 3.5} ${y - 0.4}h-1.95v4.4h-3.1v-4.4h-1.95z`;
  }

  if (mark === 'nonbinary') {
    // Six arms crossing, the asterisk the set uses.
    const bar = (angle: number) => {
      const radians = (angle * Math.PI) / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      const half = 3.7;
      const width = 0.95;
      const px = -dy * width;
      const py = dx * width;

      return [
        `M${(x + dx * half + px).toFixed(2)} ${(y + dy * half + py).toFixed(2)}`,
        `L${(x - dx * half + px).toFixed(2)} ${(y - dy * half + py).toFixed(2)}`,
        `L${(x - dx * half - px).toFixed(2)} ${(y - dy * half - py).toFixed(2)}`,
        `L${(x + dx * half - px).toFixed(2)} ${(y + dy * half - py).toFixed(2)}`,
        'z',
      ].join(' ');
    };

    return [bar(90), bar(30), bar(150)].join(' ');
  }

  // Plain: a ring with its centre left solid, which is the collar mark.
  return `M${x} ${y - 3.6}a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z`
    + `M${x} ${y - 1.75}a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z`;
}

/** A heraldic shield, filled. */
const SHIELD_PATH = 'M12 1.9 20.7 4.9V12c0 4.8-3.4 8.4-8.7 10.2C6.7 20.4 3.3 16.8 3.3 12V4.9z';

function Emblem({ className, frame, mark }: EmblemProps & { frame: 'shield' | 'ring' | 'brackets'; mark: InnerMark }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {frame === 'shield' ? (
        <path clipRule="evenodd" d={`${SHIELD_PATH} ${markPath(mark)}`} fillRule="evenodd" />
      ) : null}

      {frame === 'ring' ? (
        <>
          <circle cx="12" cy={MARK_CENTRE.y} fill="none" r="8.4" stroke="currentColor" strokeWidth="1.9" />
          <path clipRule="evenodd" d={markPath(mark)} fillRule="evenodd" />
        </>
      ) : null}

      {frame === 'brackets' ? (
        <>
          {/* Four corners and no sides: no collar on it. */}
          <g fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="1.9">
            <path d="M3.4 7.1V2.9h4.2" />
            <path d="M20.6 7.1V2.9h-4.2" />
            <path d="M3.4 14.7v4.2h4.2" />
            <path d="M20.6 14.7v4.2h-4.2" />
          </g>
          <path clipRule="evenodd" d={markPath(mark)} fillRule="evenodd" />
        </>
      ) : null}
    </svg>
  );
}

export function CollarHolderGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="shield" mark="plain" />;
}

export function CollarHolderFemaleGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="shield" mark="female" />;
}

export function CollarHolderMaleGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="shield" mark="male" />;
}

export function CollarHolderNonbinaryGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="shield" mark="nonbinary" />;
}

export function CollaredGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="ring" mark="plain" />;
}

export function CollaredFemaleGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="ring" mark="female" />;
}

export function CollaredMaleGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="ring" mark="male" />;
}

export function CollaredNonbinaryGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="ring" mark="nonbinary" />;
}

export function UncollaredGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="brackets" mark="plain" />;
}

export function UncollaredFemaleGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="brackets" mark="female" />;
}

export function UncollaredMaleGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="brackets" mark="male" />;
}

export function UncollaredNonbinaryGlyph(props: EmblemProps) {
  return <Emblem {...props} frame="brackets" mark="nonbinary" />;
}

/** Two arrows turning around a heart: moves between the two. */
export function CollarSwitchGlyph({ className }: EmblemProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 18.6c-2.8-1.9-4.2-3.4-4.2-5a2.3 2.3 0 0 1 4.2-1.2 2.3 2.3 0 0 1 4.2 1.2c0 1.6-1.4 3.1-4.2 5z" />
      <path d="M4.4 12.4a7.9 7.9 0 0 1 9.8-7.1l-.6 2.5a5.4 5.4 0 0 0-6.7 4.6z" />
      <path d="M2.2 12.6h4.9L4.6 16z" />
      <path d="M19.6 11.6a7.9 7.9 0 0 1-9.8 7.1l.6-2.5a5.4 5.4 0 0 0 6.7-4.6z" />
      <path d="M21.8 11.4h-4.9L19.4 8z" />
    </svg>
  );
}
