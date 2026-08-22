import type { CSSProperties } from 'react';

/**
 * Vibe capsules carry the same relationship colour as the heart pins:
 * pink for people you have no mutual with, purple for mutuals, indigo for you.
 */
export type VibeTone = 'nearby' | 'mutual' | 'self';

// The capsule is filled with its own border colour, which is the same colour the
// heart pin is drawn with: pink, purple, or the blue of your own pin.
const VIBE_TONE_STYLES: Record<VibeTone, CSSProperties> = {
  nearby: {
    background: 'rgba(255, 0, 114, 0.8)',
    borderColor: 'rgba(255, 0, 114, 0.8)',
    color: '#FFFFFF',
  },
  mutual: {
    background: 'rgba(111, 0, 255, 0.8)',
    borderColor: 'rgba(111, 0, 255, 0.8)',
    color: '#FFFFFF',
  },
  self: {
    background: 'rgba(0, 75, 255, 0.8)',
    borderColor: 'rgba(0, 75, 255, 0.8)',
    color: '#FFFFFF',
  },
};

export function resolveVibeTone(input: { mutual?: boolean | null; isCurrentUser?: boolean | null }): VibeTone {
  if (input.isCurrentUser) {
    return 'self';
  }

  return input.mutual ? 'mutual' : 'nearby';
}

export function vibeCapsuleStyle(tone: VibeTone): CSSProperties {
  return VIBE_TONE_STYLES[tone];
}
