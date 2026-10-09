/**
 * The BDSM emblem set, as the community draws it.
 *
 * It reads on four separate channels, which is exactly why it works and why a
 * single icon never could:
 *
 *   frame   the role      chevron is dominant, circle is submissive, hexagon is switch
 *   inner   the position  an up arrow tops, a down arrow bottoms
 *   nesting the depth     a second outline inside goes deeper than the plain frame
 *   corners the status    four dots means taken
 *
 * A top and a dominant are not the same thing, and this is the set that makes
 * that difference legible at a glance.
 *
 * cruush uses dominant, submissive, bonded, and collared language. The labels
 * describe the role or relationship without describing a person as property.
 */

type EmblemProps = {
  className?: string;
  /** Solid rather than outline. Both are in the set and both read. */
  solid?: boolean;
};

type Frame = 'dominant' | 'submissive' | 'switch';
type Inner = 'none' | 'deep' | 'bonded' | 'top' | 'bottom' | 'dom' | 'sub';

/* Frames, drawn to the same optical weight so a row of them sits level. */

const FRAME_PATHS: Record<Frame, string> = {
  // The BDSM badge chevron: outline is Dominant; the same badge filled is taken.
  dominant: 'M3.6 3.4h16.8v8.9L12 20.9 3.6 12.3z',
  // A square: closed on every side.
  submissive: 'M4.3 4.3h15.4v15.4H4.3z',
  // A hexagon: points either way, because it goes either way.
  switch: 'M8.1 4.2h7.8L21 12l-5.1 7.8H8.1L3 12z',
};

/** The same frame, stepped inward, for the marks that nest. */
const INNER_FRAME_PATHS: Record<Frame, string> = {
  dominant: 'M7 6.6h10v5.5L12 17.3 7 12.1z',
  submissive: 'M7.6 7.6h8.8v8.8H7.6z',
  switch: 'M9.7 7.6h4.6L17.4 12l-3.1 4.4H9.7L6.6 12z',
};

function innerMark(frame: Frame, inner: Inner) {
  if (inner === 'none') {
    return null;
  }

  if (inner === 'deep') {
    // A second outline inside the first: further in than the plain frame.
    return <path d={INNER_FRAME_PATHS[frame]} />;
  }

  if (inner === 'bonded') {
    // The nested outline with the centre filled: all the way in.
    return (
      <>
        <path d={INNER_FRAME_PATHS[frame]} />
        <path d="M9.8 9.8h4.4v4.4H9.8z" fill="currentColor" stroke="none" />
      </>
    );
  }

  if (inner === 'top') {
    return (
      <g strokeWidth="2.1">
        <path d="M12 16.6V8.2" />
        <path d="m8.6 11.4 3.4-3.4 3.4 3.4" />
      </g>
    );
  }

  if (inner === 'bottom') {
    return (
      <g strokeWidth="2.1">
        <path d="M12 7.6V16" />
        <path d="m8.6 12.8 3.4 3.4 3.4-3.4" />
      </g>
    );
  }

  if (inner === 'dom') {
    // A chevron inside: the dominant frame, borrowed.
    return <path d="M8 8.2h8v3.9L12 16l-4-3.9z" />;
  }

  // A square inside: the submissive frame, borrowed.
  return <path d="M8.4 8.4h7.2v7.2H8.4z" />;
}
function Emblem({
  className,
  frame,
  inner = 'none',
  solid = false,
  taken = false,
}: EmblemProps & { frame: Frame; inner?: Inner; taken?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={FRAME_PATHS[frame]}
        fill={solid ? 'currentColor' : 'none'}
      />
      <g stroke={solid ? 'var(--cruush-emblem-knockout, #05050A)' : 'currentColor'}>
        {innerMark(frame, inner)}
      </g>
      {taken ? (
        // Four corners: taken, whatever the arrangement inside is.
        <g fill="currentColor" stroke="none">
          <circle cx="2.1" cy="2.1" r="1.5" />
          <circle cx="21.9" cy="2.1" r="1.5" />
          <circle cx="2.1" cy="21.9" r="1.5" />
          <circle cx="21.9" cy="21.9" r="1.5" />
        </g>
      ) : null}
    </svg>
  );
}

/* Dominant */

export function DominantTakenEmblem(props: EmblemProps) {
  return <Emblem {...props} className={`${props.className ?? ''} origin-center scale-[0.84]`} frame="dominant" solid />;
}

export function DomEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="dominant" />;
}

export function TopEmblem(props: EmblemProps) {
  return (
    <svg aria-hidden="true" className={props.className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 19V6" />
      <path d="M6.5 11.5 12 5.5l5.5 6" />
    </svg>
  );
}

/* Submissive */

function SubmissiveCircleEmblem({ className, solid = false }: EmblemProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" fill={solid ? 'currentColor' : 'none'} r="7.7" />
    </svg>
  );
}

export function SubmissiveTakenEmblem(props: EmblemProps) {
  return <SubmissiveCircleEmblem {...props} solid />;
}

export function SubEmblem(props: EmblemProps) {
  return <SubmissiveCircleEmblem {...props} />;
}

export function BottomEmblem(props: EmblemProps) {
  return (
    <svg aria-hidden="true" className={props.className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v13" />
      <path d="M6.5 12.5 12 18.5l5.5-6" />
    </svg>
  );
}

/* Switch */

export function SwitchEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="switch" inner="none" />;
}

export function SwitchDeepEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="switch" inner="deep" />;
}

export function DomSwitchEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="switch" inner="dom" />;
}

export function SubSwitchEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="switch" inner="sub" />;
}

export function TopSwitchEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="switch" inner="top" />;
}

export function BottomSwitchEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="switch" inner="bottom" />;
}

export function TakenSwitchEmblem(props: EmblemProps) {
  return <Emblem {...props} frame="switch" solid />;
}
