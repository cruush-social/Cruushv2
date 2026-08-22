import partyHatIcon from '../assets/ui-icons/party-hat.svg';
import type { LucideProps } from 'lucide-react';

/**
 * Marks that no general icon set has a word for. Drawn in the same line weight
 * as the lucide icons beside them so a row of badges reads as one set.
 */

type GlyphProps = Pick<LucideProps, 'className' | 'strokeWidth'>;

export function LipsGlyph({ className, strokeWidth = 2 }: GlyphProps) {
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
      {/* Upper lip: two peaks of the cupid's bow meeting at a centre dip, then
          down to the corners. Lower lip: one fuller curve back. */}
      <path d="M12 9.8 10.2 7.9C8.9 6.6 7.4 6.7 5.9 8L2.8 10.6" />
      <path d="M12 9.8 13.8 7.9c1.3-1.3 2.8-1.2 4.3.1l3.1 2.6" />
      <path d="M2.8 10.6h18.4" />
      <path d="M2.8 10.6c1.8 4.4 4.8 6.6 9.2 6.6s7.4-2.2 9.2-6.6" />
    </svg>
  );
}

export function TongueGlyph({ className, strokeWidth = 2 }: GlyphProps) {
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
      {/* An open mouth with the tongue out: gooning rather than a lightning bolt. */}
      <path d="M3.4 8.6c2.4-2.4 4.8-2.6 7-0.6l1.6 1.4 1.6-1.4c2.2-2 4.6-1.8 7 0.6" />
      <path d="M3.4 8.6c0 4.4 2.6 7.4 6 8.2" />
      <path d="M20.6 8.6c0 4.4-2.6 7.4-6 8.2" />
      <path d="M9.4 12.6h5.2v4.4a2.6 2.6 0 0 1-5.2 0z" />
    </svg>
  );
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

export function SelkieGlyph({ className, strokeWidth = 2 }: GlyphProps) {
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
      {/* A seal watching from the waterline: the head and eyes read above the
          surface, the rest of it does not. Both halves of the story in two
          shapes, which is all that survives at pin size. */}
      <path d="M6.9 14.6c0-2.9 2.3-5.2 5.1-5.2s5.1 2.3 5.1 5.2" />
      <path d="M9.9 12.6h.01" />
      <path d="M14.1 12.6h.01" />
      <path d="M2.5 14.6h19" />
      <path d="M2.5 18.1c1.6 0 1.6 1.5 3.2 1.5s1.6-1.5 3.2-1.5 1.6 1.5 3.1 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5" />
    </svg>
  );
}

export function SelkiePeltGlyph({ className, strokeWidth = 2 }: GlyphProps) {
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
