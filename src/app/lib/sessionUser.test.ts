import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import { setPersistentNoticeFlag } from './persistentNotice';

const { getAuthSession } = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
}));

vi.mock('./authApi', () => ({
  getAuthSession,
}));

import {
  clearCurrentUser,
  clearDeletedAccountUser,
  clearVerificationPreviewUrl,
  getCurrentUserId,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  loadCurrentSession,
  persistCurrentUser,
  setVerificationPreviewUrl,
} from './sessionUser';

describe('sessionUser', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getAuthSession.mockReset();
    document.cookie.split(';').forEach(entry => {
      document.cookie = `${entry.trim().split('=')[0]}=; Max-Age=0; Path=/`;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns the persisted local user id when present', async () => {
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'user-local-1', name: 'Alex' }));

    await expect(getCurrentUserId()).resolves.toBe('user-local-1');
    expect(getAuthSession).not.toHaveBeenCalled();
  });

  it('falls back to the backend session user id and persists it locally', async () => {
    getAuthSession.mockResolvedValue({
      user: {
        id: 'user-auth-2',
        email: 'river@example.com',
        displayName: 'River',
        emailVerifiedAt: null,
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'River',
        yearOfBirth: 1996,
      },
      needsOnboarding: false,
    });

    await expect(getCurrentUserId()).resolves.toBe('user-auth-2');
    expect(JSON.parse(localStorage.getItem('cruush_user') ?? '{}')).toMatchObject({
      id: 'user-auth-2',
      name: 'River',
      display_name: 'River',
      year_of_birth: 1996,
      age: new Date().getFullYear() - 1996,
    });
  });

  it('returns null from loadCurrentSession on 401 and clears stale local user data', async () => {
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'stale-user' }));
    getAuthSession.mockRejectedValue(new ApiClientError(401, 'AUTH_REQUIRED', 'Authentication required.'));

    await expect(loadCurrentSession()).resolves.toBeNull();
    expect(localStorage.getItem('cruush_user')).toBeNull();
  });

  it('stores and clears the dev verification preview url', () => {
    setVerificationPreviewUrl('https://cruush.test/verify-email?token=abc');

    expect(getVerificationPreviewUrl()).toBe('https://cruush.test/verify-email?token=abc');

    clearVerificationPreviewUrl();

    expect(getVerificationPreviewUrl()).toBeNull();
  });

  it('clears auth-owned local state and browser session state without wiping local preferences', () => {
    localStorage.setItem('cruush_auth', 'legacy-token');
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'user-local-1' }));
    localStorage.setItem('cruush_verification_preview_url', 'https://cruush.test/verify-email?token=abc');
    localStorage.setItem('cruush-install-prompt-dismissed', 'true');
    sessionStorage.setItem('cruush-location-permission-prompted', 'true');

    clearCurrentUser();

    expect(localStorage.getItem('cruush_auth')).toBeNull();
    expect(localStorage.getItem('cruush_user')).toBeNull();
    expect(localStorage.getItem('cruush_verification_preview_url')).toBeNull();
    expect(localStorage.getItem('cruush-install-prompt-dismissed')).toBe('true');
    expect(sessionStorage.getItem('cruush-location-permission-prompted')).toBeNull();
  });

  it('persists the verification timestamp from the backend session', async () => {
    getAuthSession.mockResolvedValue({
      user: {
        id: 'user-auth-3',
        email: 'verified@example.com',
        displayName: 'Verified',
        emailVerifiedAt: '2026-04-29T12:05:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
      },
      profile: {
        displayName: 'Verified',
        yearOfBirth: 1994,
      },
      needsOnboarding: false,
    });

    await expect(loadCurrentSession()).resolves.toMatchObject({
      user: {
        id: 'user-auth-3',
      },
    });
    expect(getStoredCurrentUser()).toMatchObject({
      id: 'user-auth-3',
      email_verified_at: '2026-04-29T12:05:00.000Z',
    });
  });

  it('erases deleted-account browser data and cookie-only notices while preserving other users and layout', () => {
    const userId = 'deleted-user';
    const erasedKeys = [
      'cruush_auth', 'cruush_user', 'cruush_verification_preview_url',
      'cruush:onboarding-draft', 'cruush.activity.seenAt', 'feed.mutual.seenAt',
      'cruush:dl-mode-enabled', 'cruush:dl-mode-show-only-exception',
      'cruush:distance-preference', 'cruush:distance-preference:owner',
      `cruush:first-entry-push:v1:${userId}`, `cruush:first-entry-push-completed:v1:${userId}`,
      `cruush:first-entry-install:v1:${userId}`, `cruush:first-entry-purgatory:v1:${userId}`,
      `cruush:affiliate-login-day:v1:${userId}`, `cruush:pulse-gesture-intro-seen:${userId}`,
      `cruush:first-entry-push:v0:${userId}`, `cruush:plus-card:${userId}:grant-1`,
      `cruush:first-feed-post-prompt-seen:${userId}`,
    ];
    const preservedKeys = [
      'cruush:accessibility-preferences', 'cruush.desktopPageLayout',
      'cruush.desktopDock.feed', 'cruush.pulse.desktopGeometry', 'cruush:rewards:benefits-open',
      'cruush:map-last-zoom', 'cruush:map-spots-hidden', 'cruush:installed:v1',
      'cruush:tutorial-v5-seen', 'unrelated-preference',
      `cruush:first-entry-push:v1:${userId}-other`, 'cruush:affiliate-login-day:v1:other-user',
      'cruush:first-feed-post-prompt-seen:other-user', 'cruush:plus-card:other-user:grant-2',
    ];
    [...erasedKeys, ...preservedKeys].forEach(key => localStorage.setItem(key, 'retained-until-deletion'));
    localStorage.setItem('cruush_user', JSON.stringify({ id: userId, display_name: 'Deleted profile' }));
    localStorage.setItem('cruush:distance-preference:owner', userId);
    sessionStorage.setItem('cruush:map-viewport-restore', '{"lat":40,"lng":-73}');
    setPersistentNoticeFlag(`cruush:first-feed-post-prompt-seen:${userId}`);
    setPersistentNoticeFlag(`cruush:plus-card:${userId}:cookie-only-grant`);
    localStorage.removeItem(`cruush:plus-card:${userId}:cookie-only-grant`);
    setPersistentNoticeFlag('cruush:plus-card:other-user:grant-2');
    setPersistentNoticeFlag('cruush:first-feed-post-prompt-seen:other-user');

    clearDeletedAccountUser(userId);

    erasedKeys.forEach(key => expect(localStorage.getItem(key), key).toBeNull());
    preservedKeys.forEach(key => expect(localStorage.getItem(key), key).not.toBeNull());
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain(`_${userId}`);
    expect(document.cookie).toContain('cruush_plus-card_other-user_grant-2=true');
    expect(document.cookie).toContain('cruush_first-feed-post-prompt-seen_other-user=true');
  });

  it('preserves a newer account and its draft and distance preference when deletion finishes in another tab', () => {
    const newProfile = JSON.stringify({ id: 'new-user', display_name: 'New profile' });
    localStorage.setItem('cruush_user', newProfile);
    localStorage.setItem('cruush_auth', 'new-auth');
    localStorage.setItem('cruush:onboarding-draft', 'new-draft');
    localStorage.setItem('cruush:distance-preference:owner', 'new-user');
    localStorage.setItem('cruush:distance-preference', '{"mode":"precise"}');
    localStorage.setItem('cruush:first-entry-push:v1:deleted-user', 'true');
    sessionStorage.setItem('new-session', 'new-data');

    clearDeletedAccountUser('deleted-user');

    expect(localStorage.getItem('cruush_user')).toBe(newProfile);
    expect(localStorage.getItem('cruush_auth')).toBe('new-auth');
    expect(localStorage.getItem('cruush:onboarding-draft')).toBe('new-draft');
    expect(localStorage.getItem('cruush:distance-preference:owner')).toBe('new-user');
    expect(localStorage.getItem('cruush:distance-preference')).toBe('{"mode":"precise"}');
    expect(localStorage.getItem('cruush:first-entry-push:v1:deleted-user')).toBeNull();
    expect(sessionStorage.getItem('new-session')).toBe('new-data');
  });

  it('continues other erasure when an individual local storage key cannot be removed', () => {
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'deleted-user' }));
    localStorage.setItem('cruush_auth', 'old-auth');
    localStorage.setItem('cruush:onboarding-draft', 'old-draft');
    const removeItem = localStorage.removeItem.bind(localStorage);
    vi.spyOn(localStorage, 'removeItem').mockImplementation(key => {
      if (key === 'cruush_auth') throw new Error('blocked');
      removeItem(key);
    });

    expect(() => clearDeletedAccountUser('deleted-user')).not.toThrow();
    expect(localStorage.getItem('cruush_user')).toBeNull();
    expect(localStorage.getItem('cruush:onboarding-draft')).toBeNull();
  });

  it('does not restore a deleted profile from an earlier session or profile response', async () => {
    const userId = 'deleted-late-response';
    let finishSession!: (session: unknown) => void;
    localStorage.setItem('cruush_user', JSON.stringify({ id: userId }));
    getAuthSession.mockImplementationOnce(() => new Promise(resolve => { finishSession = resolve; }));
    const pendingSession = loadCurrentSession();

    clearDeletedAccountUser(userId);
    finishSession({
      user: { id: userId, displayName: 'Old profile', emailVerifiedAt: null },
      profile: { displayName: 'Old profile', yearOfBirth: 1994 },
    });
    await expect(pendingSession).resolves.toBeNull();
    persistCurrentUser({ id: userId, display_name: 'Old profile' });

    expect(localStorage.getItem('cruush_user')).toBeNull();
    persistCurrentUser({ id: 'unrelated-active-user', display_name: 'New profile' });
    expect(getStoredCurrentUser()?.id).toBe('unrelated-active-user');
  });
});
