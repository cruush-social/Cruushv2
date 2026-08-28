/**
 * Marks for the communities people flag for. These are symbols the communities
 * already use, drawn in the same line weight as the icons beside them so a row
 * of badges reads as one set. Nothing here is invented, because a symbol people
 * already wear is worth more than a prettier one they do not recognise.
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

/** The trans symbol: a circle carrying the three arms at once. */
export function TransGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="13" r="4.4" />
      <path d="M12 17.4v4.2" />
      <path d="M9.6 19.6h4.8" />
      <path d="m15.1 9.9 3.8-3.8" />
      <path d="M15.6 6.1h3.3v3.3" />
      <path d="m8.9 9.9-3.8-3.8" />
      <path d="M8.4 6.1H5.1v3.3" />
    </Glyph>
  );
}

/** Two of the same, facing each other. */
export function T4TGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 5.6h6.4" />
      <path d="M6.2 5.6v8.2" />
      <path d="M14.6 5.6H21" />
      <path d="M17.8 5.6v8.2" />
      <path d="M8.6 19.4c1-1.6 2.2-2.4 3.4-2.4s2.4.8 3.4 2.4" />
    </Glyph>
  );
}

/** The nonbinary symbol: the circle with the plain arm above it. */
export function NonbinaryGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="15" r="4.4" />
      <path d="M12 10.6V3.2" />
      <path d="m9.1 5.1 5.8-1.6" />
      <path d="m14.9 5.1-5.8-1.6" />
    </Glyph>
  );
}

/** The labrys, the double axe. */
export function LabrysGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 8.2v13.2" />
      <path d="M12 8.2c-3 0-5.2-1.2-6.6-3.6 1.4-1.4 3.6-2.1 6.6-2.1s5.2.7 6.6 2.1C17.2 7 15 8.2 12 8.2Z" />
    </Glyph>
  );
}

/** The polyamory infinity heart, reduced to its two loops and a point. */
export function PolyGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 9.6c1.4-2.1 3-3.1 4.8-3.1a3.6 3.6 0 0 1 0 7.2c-1.8 0-3.4-1-4.8-3.1Z" />
      <path d="M12 9.6c-1.4-2.1-3-3.1-4.8-3.1a3.6 3.6 0 0 0 0 7.2c1.8 0 3.4-1 4.8-3.1Z" />
      <path d="M8.4 13.7 12 20.4l3.6-6.7" />
    </Glyph>
  );
}

/** The ace of spades, which the ace community wears. */
export function PlayingCard(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect height="18.4" rx="2.4" width="14" x="5" y="2.8" />
      <path d="M12 7.2c1.8 2.2 3.4 3.8 3.4 5.4a2 2 0 0 1-3.4 1.4 2 2 0 0 1-3.4-1.4c0-1.6 1.6-3.2 3.4-5.4Z" />
      <path d="M12 14v2.8" />
    </Glyph>
  );
}

/*
 * Interlocking gender symbols. These are the oldest marks the communities have,
 * older than any flag, and people still read them instantly. Drawn as circles
 * and arms rather than glyph characters so they hold their weight beside the
 * rest of the set at badge size.
 */

/** Mars over Mars. */
export function DoubleMarsGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="16" r="4.2" />
      <circle cx="14.6" cy="16" r="4.2" />
      <path d="m11 13 4.4-4.4" />
      <path d="M12.2 8.6h3.6v3.6" />
      <path d="m17.6 13 3.4-3.4" />
      <path d="M17.8 9.6H21v3.2" />
    </Glyph>
  );
}

/** Venus over Venus. */
export function DoubleVenusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8.4" r="4.2" />
      <circle cx="14.6" cy="8.4" r="4.2" />
      <path d="M8 12.6v7.2" />
      <path d="M5.6 17h4.8" />
      <path d="M14.6 12.6v7.2" />
      <path d="M12.2 17H17" />
    </Glyph>
  );
}

/** Mars and Venus, linked. */
export function MarsVenusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="8.4" cy="12" r="4.2" />
      <circle cx="15.4" cy="12" r="4.2" />
      <path d="M8.4 16.2v5.2" />
      <path d="M6.2 19h4.4" />
      <path d="m18.2 8.6 2.8-2.8" />
      <path d="M17.8 5.8H21V9" />
    </Glyph>
  );
}

/** The intersex symbol: one circle carrying both arms. */
export function IntersexGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="11" cy="13" r="4.6" />
      <path d="M11 17.6v4.2" />
      <path d="M8.8 19.8h4.4" />
      <path d="m14.4 9.6 4.6-4.6" />
      <path d="M15.4 5h3.6v3.6" />
    </Glyph>
  );
}

/** Trans over trans, for the pairing rather than the identity. */
export function DoubleTransGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="7.6" cy="13.6" r="3.6" />
      <path d="M7.6 17.2v4.2" />
      <path d="M5.6 19.4h4" />
      <path d="m10 11.2 2.8-2.8" />
      <path d="M10.2 8.2h2.8V11" />
      <circle cx="16.4" cy="13.6" r="3.6" />
      <path d="M16.4 17.2v4.2" />
      <path d="M14.4 19.4h4" />
      <path d="m18.8 11.2 2.6-2.6" />
      <path d="M19 8.4h2.6V11" />
    </Glyph>
  );
}
