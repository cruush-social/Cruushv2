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
