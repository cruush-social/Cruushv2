import { describe, expect, it } from 'vitest';
import { shouldMaskPhoto } from './dlMode';

describe('shouldMaskPhoto', () => {
  it('masks only explicitly classified photos when DL Mode is active', () => {
    expect(shouldMaskPhoto(true, undefined)).toBe(false);
    expect(shouldMaskPhoto(true, null)).toBe(false);
    expect(shouldMaskPhoto(true, true)).toBe(true);
  });

  it('allows non-explicit and unclassified photos through when DL Mode is off', () => {
    expect(shouldMaskPhoto(true, false)).toBe(false);
    expect(shouldMaskPhoto(false, false)).toBe(false);
    expect(shouldMaskPhoto(false, undefined)).toBe(false);
    expect(shouldMaskPhoto(false, null)).toBe(false);
  });
});
