import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from './persistentNotice';

const NOTICE_KEY = 'cruush:test-notice';
const NOTICE_COOKIE = 'cruush_test-notice';

function clearNoticeCookie() {
  document.cookie = `${NOTICE_COOKIE}=; Max-Age=0; Path=/`;
}

describe('persistent notice flags', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearNoticeCookie();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearNoticeCookie();
  });

  it('stores notice dismissal in localStorage and a cookie', () => {
    setPersistentNoticeFlag(NOTICE_KEY);

    expect(window.localStorage.getItem(NOTICE_KEY)).toBe('true');
    expect(document.cookie).toContain(`${NOTICE_COOKIE}=true`);
    expect(hasPersistentNoticeFlag(NOTICE_KEY)).toBe(true);
  });

  it('falls back to the cookie when localStorage cannot be read', () => {
    document.cookie = `${NOTICE_COOKIE}=true; Path=/`;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked');
    });

    expect(hasPersistentNoticeFlag(NOTICE_KEY)).toBe(true);
  });

  it('still writes the cookie when localStorage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage blocked');
    });

    setPersistentNoticeFlag(NOTICE_KEY);

    expect(document.cookie).toContain(`${NOTICE_COOKIE}=true`);
  });
});
