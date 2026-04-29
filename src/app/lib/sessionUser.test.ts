import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';

const { getAuthSession } = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
}));

vi.mock('./authApi', () => ({
  getAuthSession,
}));

import { getCurrentUserId, loadCurrentSession } from './sessionUser';

describe('sessionUser', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
