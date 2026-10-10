import { beforeEach, describe, expect, it, vi } from 'vitest';
import { androidPushPromptSessionKey, resetPushPromptForLogin } from './pushPromptSession';

describe('Android push prompt login state', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('clears only the signing-in account reminder dismissal', () => {
    sessionStorage.setItem(androidPushPromptSessionKey('member-1'), 'true');
    sessionStorage.setItem(androidPushPromptSessionKey('member-2'), 'true');
    sessionStorage.setItem('unrelated-setting', 'keep');
    localStorage.setItem('cruush:first-entry-push:v1:member-1', 'true');
    resetPushPromptForLogin('member-1');
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBeNull();
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-2'))).toBe('true');
    expect(sessionStorage.getItem('unrelated-setting')).toBe('keep');
    expect(localStorage.getItem('cruush:first-entry-push:v1:member-1')).toBe('true');
  });

  it('allows an account to log in with no prior reminder dismissal', () => {
    expect(() => resetPushPromptForLogin('member-1')).not.toThrow();
    expect(sessionStorage.getItem(androidPushPromptSessionKey('member-1'))).toBeNull();
  });

  it('does not interrupt sign-in when removing reminder storage throws', () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    try {
      expect(() => resetPushPromptForLogin('member-1')).not.toThrow();
    } finally { remove.mockRestore(); }
  });

  it('does not interrupt sign-in when accessing session storage throws', () => {
    const storage = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('Storage unavailable'); });
    try {
      expect(() => resetPushPromptForLogin('member-1')).not.toThrow();
    } finally { storage.mockRestore(); }
  });
});
