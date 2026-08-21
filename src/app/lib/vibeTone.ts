import type { CSSProperties } from 'react';

/**
 * Vibe capsules carry the same relationship colour as the heart pins:
 * pink for people you have no mutual with, purple for mutuals, indigo for you.
 */
export type VibeTone = 'nearby' | 'mutual' | 'self';

const VIBE_TONE_STYLES: Record<VibeTone, CSSProperties> = {
  nearby: {
    background: 'rgba(255, 0, 114, 0.16)',
    borderColor: 'rgba(255, 0, 114, 0.55)',
    color: '#FFB3D2',
  },
  mutual: {
    background: 'rgba(111, 0, 255, 0.18)',
    borderColor: 'rgba(111, 0, 255, 0.6)',
    color: '#DCC7FF',
  },
  self: {
    background: 'rgba(56, 38, 255, 0.2)',
    borderColor: 'rgba(56, 38, 255, 0.62)',
    color: '#C3D0FF',
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
