import { beforeEach, describe, expect, it } from 'vitest';
import { setDlModeShowOnlyException, shouldMaskPhoto } from './dlMode';

describe('shouldMaskPhoto', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
    expect(shouldMaskPhoto(false, true, { isMutualCruush: true })).toBe(false);
  });

  it('defaults to masking every explicit photo until a show-only exception is selected', () => {
    expect(shouldMaskPhoto(true, true, { isMutualCruush: true, sharesCrowd: true })).toBe(true);
  });

  it('unmasks only the selected relationship exception', () => {
    setDlModeShowOnlyException('mutual_cruushes');
    expect(shouldMaskPhoto(true, true, { isMutualCruush: true })).toBe(false);
    expect(shouldMaskPhoto(true, true, { sharesCrowd: true })).toBe(true);

    setDlModeShowOnlyException('mutual_crowds');
    expect(shouldMaskPhoto(true, true, { sharesCrowd: true })).toBe(false);
    expect(shouldMaskPhoto(true, true, { isMutualCruush: true })).toBe(true);
    expect(shouldMaskPhoto(false, true, { nsfwPhotoRestriction: 'mutual_cruushes' })).toBe(true);
    expect(shouldMaskPhoto(true, true, { sharesCrowd: true, nsfwPhotoRestriction: 'mutual_cruushes' })).toBe(true);
    expect(shouldMaskPhoto(true, false, { nsfwPhotoRestriction: 'mutual_cruushes' })).toBe(false);
  });
});
