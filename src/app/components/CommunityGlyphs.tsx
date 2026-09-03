/**
 * Marks for the communities people flag for. These are symbols the communities
 * already use, drawn in the same line weight as the icons beside them so a row
 * of badges reads as one set. Nothing here is invented, because a symbol people
 * already wear is worth more than a prettier one they do not recognise.
 */

import t4tLinkedSymbol from '../assets/ui-icons/t4t-pride-linked-symbol.png';
import aceSpectrumDiamond from '../assets/ui-icons/ace-spectrum-diamond-2226685.png';
import bdsmTriskelion from '../assets/ui-icons/bdsm-89011.png';
import bisexualitySymbol from '../assets/ui-icons/bisexuality-2431635.png';
import gaySymbol from '../assets/ui-icons/gay-7284797.png';
import labrysSymbol from '../assets/ui-icons/labrys-5692573.png';
import polyamoryInfinityHeart from '../assets/ui-icons/polyamory-2751502.png';

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

/** The supplied linked trans-symbol mark. */
export function T4TGlyph({ className }: GlyphProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`object-contain ${className ?? ''}`}
      draggable={false}
      src={t4tLinkedSymbol}
    />
  );
}

/** The nonbinary circle with the established asterisk arm. */
export function NonbinaryGlyph(props: GlyphProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2.55}>
      <circle cx="12" cy="15.2" r="5.5" />
      <path d="M12 9.7V2" />
      <path d="M8.3 5.1h7.4" />
      <path d="m9.4 2.5 5.2 5.2" />
      <path d="m14.6 2.5-5.2 5.2" />
    </Glyph>
  );
}

/** The interlocking double Mars symbol. */
export function DoubleMarsSymbolGlyph({ className }: GlyphProps) {
  return (
    <img alt="" aria-hidden="true" className={`object-contain invert ${className ?? ''}`} draggable={false} src={gaySymbol} />
  );
}

/** The ace spectrum diamond. */
export function AceSpectrumGlyph({ className }: GlyphProps) {
  return (
    <img alt="" aria-hidden="true" className={`object-contain invert ${className ?? ''}`} draggable={false} src={aceSpectrumDiamond} />
  );
}

/** The labrys, the double axe. */
export function LabrysGlyph({ className }: GlyphProps) {
  return (
    <img alt="" aria-hidden="true" className={`object-contain invert ${className ?? ''}`} draggable={false} src={labrysSymbol} />
  );
}

/** The established interlocking bisexuality symbol. */
export function BisexualGlyph({ className }: GlyphProps) {
  return (
    <img alt="" aria-hidden="true" className={`object-contain invert ${className ?? ''}`} draggable={false} src={bisexualitySymbol} />
  );
}

/** The three-part triskelion used by the BDSM community. */
export function BdsmTriskelionGlyph({ className }: GlyphProps) {
  return (
    <img alt="" aria-hidden="true" className={`object-contain invert ${className ?? ''}`} draggable={false} src={bdsmTriskelion} />
  );
}

/** The polyamory infinity heart, reduced to its two loops and a point. */
export function PolyGlyph(props: GlyphProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`object-contain invert ${props.className ?? ''}`}
      draggable={false}
      src={polyamoryInfinityHeart}
    />
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
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2.65}>
      <circle cx="8.1" cy="15.5" r="4.6" />
      <circle cx="14.9" cy="15.5" r="4.6" />
      <path d="m11.4 12.2 5.2-5.2" />
      <path d="M13.2 7h3.4v3.4" />
      <path d="m18.2 12.2 4-4" />
      <path d="M18.8 8.2h3.4v3.4" />
    </Glyph>
  );
}

/** Venus over Venus. */
export function DoubleVenusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2.65}>
      <circle cx="8.1" cy="8.3" r="4.6" />
      <circle cx="14.9" cy="8.3" r="4.6" />
      <path d="M8.1 12.9v8.2" />
      <path d="M4.9 17.7h6.4" />
      <path d="M14.9 12.9v8.2" />
      <path d="M11.7 17.7h6.4" />
    </Glyph>
  );
}

/** Mars and Venus, linked. */
export function MarsVenusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2.65}>
      <circle cx="8.1" cy="12" r="4.6" />
      <circle cx="15" cy="12" r="4.6" />
      <path d="M8.1 16.6v5.1" />
      <path d="M5.2 19.1H11" />
      <path d="m18.3 8.7 3.9-3.9" />
      <path d="M18.8 4.8h3.4v3.4" />
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
