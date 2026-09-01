import partyHatIcon from '../assets/ui-icons/party-hat.svg';
import lips5754351 from '../assets/ui-icons/lips-5754351.png';
import nipple7851008 from '../assets/ui-icons/nipple-7851008.png';
import rim5420384 from '../assets/ui-icons/rim-5420384.png';
import peach960664 from '../assets/ui-icons/peach-960664.png';
import sex1075251 from '../assets/ui-icons/sex-1075251.png';
import zanyFace3459803 from '../assets/ui-icons/zany-face-3459803.png';
import leather3553564 from '../assets/ui-icons/leather-3553564.png';
import condom7796808 from '../assets/ui-icons/condom-7796808.png';
import type { LucideProps } from 'lucide-react';

/**
 * Marks that no general icon set has a word for. Drawn in the same line weight
 * as the lucide icons beside them so a row of badges reads as one set.
 */

type GlyphProps = Pick<LucideProps, 'className' | 'strokeWidth'>;

function NounProjectGlyph({ className, source }: GlyphProps & { source: string }) {
  const maskImage = `url(${source})`;

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        backgroundColor: 'currentColor',
        maskImage,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskImage: maskImage,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}
/** Exact Lips icon 5754351 by zafdesign from Noun Project. */
export function LipsGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={lips5754351} />;
}

/** Exact nipple icon 7851008 by Heztasia from Noun Project. */
export function NippleGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={nipple7851008} />;
}

/** Exact Sex icon 1075251 by sobinsergey from Noun Project. */
export function PenetrationGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={sex1075251} />;
}

/** Exact peach icon 960664 by Blair Adams from Noun Project. */
export function AnalGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={peach960664} />;
}

/** Exact rim icon 5420384 by Muh zakaria from Noun Project. */
export function RimmingGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={rim5420384} />;
}

/** Exact Zany Face icon 3459803 by Hamed Mirhashemi from Noun Project. */
export function GooningGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={zanyFace3459803} />;
}

/** Exact leather icon 3553564 by Gregor Cresnar from Noun Project. */
export function LeatherGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={leather3553564} />;
}

/** Exact Condom icon 7796808 by Rikas Dzihab from Noun Project. */
export function RubberGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={condom7796808} />;
}

export function StraightEdgeGlyph({ className, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth + 0.6}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The straight edge X, drawn heavy the way it is marked on a hand. */}
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

export function KeyholeEyeGlyph({ className, strokeWidth = 2 }: GlyphProps) {
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
      {/* A keyhole with an eye looking back through it. */}
      <path d="M12 2.6a6.2 6.2 0 0 1 6.2 6.2c0 2.4-1.3 4.2-2.6 5.4l1.9 6.1a1 1 0 0 1-1 1.3H7.5a1 1 0 0 1-1-1.3l1.9-6.1c-1.3-1.2-2.6-3-2.6-5.4A6.2 6.2 0 0 1 12 2.6Z" />
      <path d="M8.4 8.8c1-1.5 2.2-2.3 3.6-2.3s2.6.8 3.6 2.3c-1 1.5-2.2 2.3-3.6 2.3s-2.6-.8-3.6-2.3Z" />
      <circle cx="12" cy="8.8" r="1.1" />
    </svg>
  );
}

export function PartyHatGlyph({ className }: GlyphProps) {
  // Badge marks carry no colour, so the app's party hat is flattened to white
  // like every other mark in the row.
  return <img aria-hidden="true" alt="" className={`${className ?? ''} brightness-0 invert`} src={partyHatIcon} />;
}

export function KelpieGlyph({ className }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* A water horse watching from the loch: the head and mane above the
          surface, everything else under it. Drawn as one filled shape so it
          holds as a white mark at any size, with the eye knocked out. */}
      <path
        clipRule="evenodd"
        d="M17.6 4.1c-.6 1-1.5 1.7-2.6 2.1a6 6 0 0 0-2.3-.5c-3.3 0-6 2.5-6 5.6v3.1h11.8v-3a6 6 0 0 0-.7-2.8c.8-1.1 1.2-2.4 1.2-3.8a4 4 0 0 0-1.4-.7Zm-6.7 5.7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z"
        fillRule="evenodd"
      />
      <path d="M6.2 6.6c1 1.4 1.5 2.9 1.6 4.6-1-.6-1.7-1.6-2.2-2.9a5 5 0 0 1 .6-1.7Z" />
      <path d="M2.6 16.2h18.8v1.5H2.6z" />
      <path d="M2.6 19.1c1.4 0 1.4 1.3 2.8 1.3s1.4-1.3 2.8-1.3 1.4 1.3 2.8 1.3 1.4-1.3 2.8-1.3 1.4 1.3 2.8 1.3 1.4-1.3 2.8-1.3v1.5c-1.4 0-1.4 1.3-2.8 1.3s-1.4-1.3-2.8-1.3-1.4 1.3-2.8 1.3-1.4-1.3-2.8-1.3-1.4 1.3-2.8 1.3-1.4-1.3-2.8-1.3z" />
    </svg>
  );
}

export function KelpiePeltGlyph({ className, strokeWidth = 2 }: GlyphProps) {
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
      {/* The other half of the story: the skin taken off and hung up, which is
          what makes a selkie unrecognisable while it walks among people. */}
      <path d="M12 2.6v2.2" />
      <path d="M9.4 4.8h5.2" />
      <path d="M9.4 4.8c-2 1.6-3.2 4-3.2 6.8 0 4.4 2.6 8 5.8 8s5.8-3.6 5.8-8c0-2.8-1.2-5.2-3.2-6.8" />
      <path d="M12 9.4v6.2" />
    </svg>
  );
}

export function TravelPinGlyph({ className, strokeWidth = 2, title }: GlyphProps & { title?: string }) {
  return (
    <svg
      aria-hidden={title ? undefined : 'true'}
      className={className}
      fill="none"
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {/* A plane over a dropped pin: somewhere else, on purpose. */}
      <path d="M12 21.4s6.4-5.4 6.4-10.2a6.4 6.4 0 1 0-12.8 0C5.6 16 12 21.4 12 21.4Z" />
      <path d="M12 13.6 9.1 12l-2.2.6.7-1.6 1.7-.5-1-2.5 1.4-.5 2.1 2.2 2.6-.7a1 1 0 1 1 .5 1.9l-2.6.7-.5 2.9-1.6.5.8-2.1Z" />
    </svg>
  );
}
