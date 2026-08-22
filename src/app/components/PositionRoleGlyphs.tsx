/**
 * Marks for the two badges a basic account carries: the role on one side of the
 * heart and the position on the other.
 *
 * Positions read as direction, which is the convention the hanky code already
 * set: up gives, down takes, both ways is both. Roles read as who is leading.
 * Every mark is drawn in the same line weight as the lucide icons beside them
 * so a row of badges reads as one set, and every one of them holds at the size
 * a badge chip renders, which is 25px.
 */

type GlyphProps = {
  className?: string;
  strokeWidth?: number;
};

function Glyph({ children, className, strokeWidth = 2 }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

/* Positions */

export function TopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 19V6" />
      <path d="M6.5 11.5 12 5.5l5.5 6" />
    </Glyph>
  );
}

export function BottomGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5v13" />
      <path d="M6.5 12.5 12 18.5l5.5-6" />
    </Glyph>
  );
}

export function VersatileGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Both directions on one shaft: gives and takes equally. */}
      <path d="M12 4.5v15" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M7.5 15 12 19.5 16.5 15" />
    </Glyph>
  );
}

export function VersTopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Versatile, weighted up: the second head is smaller. */}
      <path d="M12 4.5v15" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M9.4 16.4 12 19 14.6 16.4" />
    </Glyph>
  );
}

export function VersBottomGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Versatile, weighted down. */}
      <path d="M12 4.5v15" />
      <path d="M9.4 7.6 12 5l2.6 2.6" />
      <path d="M7.5 15 12 19.5 16.5 15" />
    </Glyph>
  );
}

export function SideGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Neither up nor down: the arrow lies on its side. */}
      <path d="M4.5 12h15" />
      <path d="M9 7.5 4.5 12 9 16.5" />
      <path d="M15 7.5 19.5 12 15 16.5" />
    </Glyph>
  );
}

export function StoneTopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Gives, and the line under it is the part that does not open. */}
      <path d="M12 17V5.5" />
      <path d="M6.5 11 12 5l5.5 6" />
      <path d="M6 20.2h12" />
    </Glyph>
  );
}

export function PillowPrincessGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Takes, and is waited on: the arrow rests on a pillow. */}
      <path d="M12 4v8.5" />
      <path d="M8 9 12 13l4-4" />
      <path d="M4.4 17.4c2.4-1.2 4.9-1.8 7.6-1.8s5.2.6 7.6 1.8c-2.4 1.4-4.9 2.1-7.6 2.1s-5.2-.7-7.6-2.1Z" />
    </Glyph>
  );
}

/* Roles */

export function DominantGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Leading: the point is up and the weight sits above the line. */}
      <path d="M12 4.6 19 16H5z" />
      <path d="M6 20h12" />
    </Glyph>
  );
}

export function SubmissiveGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* The same shape, inverted, with the line above it. */}
      <path d="M12 19.4 5 8h14z" />
      <path d="M6 4h12" />
    </Glyph>
  );
}

export function SwitchGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Turns between the two rather than sitting in one. */}
      <path d="M4.8 9.6A7.6 7.6 0 0 1 19 8.4" />
      <path d="M19.2 14.4A7.6 7.6 0 0 1 5 15.6" />
      <path d="M15.6 4.8 19.4 8.6 15.6 12" />
      <path d="M8.4 19.2 4.6 15.4 8.4 12" />
    </Glyph>
  );
}

export function ServiceGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* An open hand, held out. Service is offered, not taken. */}
      <path d="M4.6 13.4c3.4-2 6.1-3 8.2-3 2.1 0 4.1.4 6.1 1.1" />
      <path d="M4.6 13.4c1 3.6 3.6 5.4 7.6 5.4 3.6 0 6.2-1.6 7.5-4.8" />
      <path d="M9 10.6V6.4" />
      <path d="M12.6 10.4V5.2" />
      <path d="M16 11V7.2" />
    </Glyph>
  );
}

export const POSITION_GLYPHS: Record<string, (props: GlyphProps) => JSX.Element> = {
  top: TopGlyph,
  bottom: BottomGlyph,
  versatile: VersatileGlyph,
  'vers top': VersTopGlyph,
  'vers bottom': VersBottomGlyph,
  side: SideGlyph,
  'stone top': StoneTopGlyph,
  'pillow princess': PillowPrincessGlyph,
};

export const ROLE_GLYPHS: Record<string, (props: GlyphProps) => JSX.Element> = {
  dominant: DominantGlyph,
  submissive: SubmissiveGlyph,
  switch: SwitchGlyph,
  service: ServiceGlyph,
};

export function positionGlyphFor(value: string | null | undefined) {
  return value ? POSITION_GLYPHS[value.trim().toLowerCase()] ?? null : null;
}

export function roleGlyphFor(value: string | null | undefined) {
  return value ? ROLE_GLYPHS[value.trim().toLowerCase()] ?? null : null;
}
