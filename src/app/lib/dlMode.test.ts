import { describe, expect, it } from 'vitest';
import { shouldMaskPhoto } from './dlMode';

describe('shouldMaskPhoto', () => {
  it('fails closed when classification is missing, unknown, or explicit', () => {
    expect(shouldMaskPhoto(true, undefined)).toBe(true);
    expect(shouldMaskPhoto(true, null)).toBe(true);
    expect(shouldMaskPhoto(true, true)).toBe(true);
  });

  it('only allows a confirmed non-explicit classification through DL Mode', () => {
    expect(shouldMaskPhoto(true, false)).toBe(false);
    expect(shouldMaskPhoto(false, false)).toBe(false);
  });

  it('keeps unknown classification masked even when DL Mode is off', () => {
    expect(shouldMaskPhoto(false, undefined)).toBe(true);
    expect(shouldMaskPhoto(false, null)).toBe(true);
  });
});
