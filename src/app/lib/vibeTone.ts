import type { CSSProperties } from 'react';

/**
 * Vibe capsules carry the same relationship colour as the heart pins:
 * pink for people you have no mutual with, purple for mutuals, indigo for you.
 */
export type VibeTone = 'nearby' | 'mutual' | 'self';

// The capsules sit over photography, so they carry enough fill to stay legible
// against a bright frame instead of washing out into it.
const VIBE_TONE_STYLES: Record<VibeTone, CSSProperties> = {
  nearby: {
    background: 'rgba(255, 0, 114, 0.46)',
    borderColor: 'rgba(255, 0, 114, 0.78)',
    color: '#FFE2EE',
  },
  mutual: {
    background: 'rgba(111, 0, 255, 0.48)',
    borderColor: 'rgba(111, 0, 255, 0.82)',
    color: '#EFE4FF',
  },
  self: {
    background: 'rgba(56, 38, 255, 0.5)',
    borderColor: 'rgba(56, 38, 255, 0.84)',
    color: '#E2E8FF',
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
