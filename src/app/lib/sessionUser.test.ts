import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';

const { getAuthSession } = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
}));

vi.mock('./authApi', () => ({
  getAuthSession,
}));

import {
  clearCurrentUser,
  clearVerificationPreviewUrl,
  getCurrentUserId,
  getStoredCurrentUser,
  getVerificationPreviewUrl,
  loadCurrentSession,
  setVerificationPreviewUrl,
} from './sessionUser';

describe('sessionUser', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getAuthSession.mockReset();
  });

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
});
