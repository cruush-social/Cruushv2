/**
 * The twelve zodiac glyphs, drawn rather than set as text, so they hold the
 * same line weight as every other badge mark and do not depend on a font that
 * carries the astrological block.
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

export function AriesGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 20V8" />
      <path d="M12 8c0-2.6-1.5-4.4-3.6-4.4S4.8 5.2 4.8 7.6c0 1.4.4 2.6 1.1 3.6" />
      <path d="M12 8c0-2.6 1.5-4.4 3.6-4.4s3.6 1.6 3.6 4c0 1.4-.4 2.6-1.1 3.6" />
    </Glyph>
  );
}

export function TaurusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="15.4" r="5.2" />
      <path d="M4.8 4.2c1.6 3 4 4.5 7.2 4.5s5.6-1.5 7.2-4.5" />
    </Glyph>
  );
}

export function GeminiGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8.4 4.6v14.8" />
      <path d="M15.6 4.6v14.8" />
      <path d="M4.6 4.6c4.8 1.6 9.8 1.6 14.8 0" />
      <path d="M4.6 19.4c4.8-1.6 9.8-1.6 14.8 0" />
    </Glyph>
  );
}

export function CancerGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.4 10.6c2.6-3.4 6.6-4.8 11-4" />
      <circle cx="7.6" cy="10.8" r="2.6" />
      <path d="M20.6 13.4c-2.6 3.4-6.6 4.8-11 4" />
      <circle cx="16.4" cy="13.2" r="2.6" />
    </Glyph>
  );
}

export function LeoGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8.6" r="3.4" />
      <path d="M11.4 8.6c-.8 3.4-.4 6 1.2 7.8 1.2 1.4 2.8 1.8 4.4 1.2 1.4-.6 2.2-2 2-3.4" />
    </Glyph>
  );
}

export function VirgoGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 6.4c1.4 0 2.2.9 2.2 2.6v8" />
      <path d="M6.2 8.4c0-1.4.9-2.2 2.2-2.2s2.2.9 2.2 2.6v8.2" />
      <path d="M10.6 8.6c0-1.4.9-2.2 2.2-2.2s2.4 1 2.4 3v6.4c0 2.4 1.6 4 4.4 4.2" />
      <path d="M15.2 16.4c1.4 1.8 3 2.8 4.8 3" />
    </Glyph>
  );
}

export function LibraGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.6 19.4h16.8" />
      <path d="M3.6 14.6h6.2a4.6 4.6 0 1 1 8.4 0h2.2" />
    </Glyph>
  );
}

export function ScorpioGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 6.6c1.4 0 2.2.9 2.2 2.6v8" />
      <path d="M5.2 8.6c0-1.4.9-2.2 2.2-2.2s2.2.9 2.2 2.6v8.2" />
      <path d="M9.6 8.6c0-1.4.9-2.2 2.2-2.2s2.4 1 2.4 3v7.4h4.4" />
      <path d="m16.4 13.6 4.6 4.2-4.6 3.4" />
    </Glyph>
  );
}

export function SagittariusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4.6 19.4 19.4 4.6" />
      <path d="M12.4 4.6h7v7" />
      <path d="m8.6 12.2 3.4 3.4" />
    </Glyph>
  );
}

export function CapricornGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.6 6.4c1.4 0 2.2.9 2.2 2.6v8.4" />
      <path d="M5.8 9c0-1.6 1-2.6 2.4-2.6 1.6 0 2.6 1.2 2.6 3.2v7.6" />
      <path d="M10.8 13.6c1-1.6 2.4-2.4 4-2.4a3.6 3.6 0 0 1 0 7.2c-1.4 0-2.4-.8-2.4-2 0-1.4 1.2-2.2 3-2.2" />
    </Glyph>
  );
}

export function AquariusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.4 10.4 7 7.4l3.4 3 3.6-3 3.6 3" />
      <path d="M3.4 16.6 7 13.6l3.4 3 3.6-3 3.6 3" />
    </Glyph>
  );
}

export function PiscesGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M6.6 3.6c-2.6 4.8-2.6 11.2 0 16.8" />
      <path d="M17.4 3.6c2.6 4.8 2.6 11.2 0 16.8" />
      <path d="M4.2 12h15.6" />
    </Glyph>
  );
}

export const ZODIAC_GLYPHS = {
  Aries: AriesGlyph,
  Taurus: TaurusGlyph,
  Gemini: GeminiGlyph,
  Cancer: CancerGlyph,
  Leo: LeoGlyph,
  Virgo: VirgoGlyph,
  Libra: LibraGlyph,
  Scorpio: ScorpioGlyph,
  Sagittarius: SagittariusGlyph,
  Capricorn: CapricornGlyph,
  Aquarius: AquariusGlyph,
  Pisces: PiscesGlyph,
} as const;
