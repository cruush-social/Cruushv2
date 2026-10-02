import { beforeEach, describe, expect, it } from 'vitest';
import { getSanitizedAnalyticsPath } from './analyticsPath';

describe('analyticsPath', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('keeps route analytics free of tokens and record ids', () => {
    expect(getSanitizedAnalyticsPath('/reset-password?token=secret-reset-token')).toBe('/reset-password');
    expect(getSanitizedAnalyticsPath('/?verifyEmailToken=secret-email-token')).toBe('/');
    expect(getSanitizedAnalyticsPath('/profile/ef12a1e3-dda4-48fd-af83-e0e8bc9a421e')).toBe('/profile/:userId');
    expect(getSanitizedAnalyticsPath('/chat/group/7fba9ce1-b9ca-44f3-a4b1-03ad861a24d2')).toBe('/chat/group/:chatId');
    expect(getSanitizedAnalyticsPath('/map?mode=mutuals&focusUserId=user-2')).toBe('/map?mode=mutuals');
  });
});
