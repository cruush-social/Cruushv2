import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('../../../utils/supabase/client', () => ({
  default: {
    auth: {
      getUser,
    },
  },
}));

import { getCurrentUserId } from './sessionUser';

describe('getCurrentUserId', () => {
  beforeEach(() => {
    localStorage.clear();
    getUser.mockReset();
  });

  it('returns the persisted local user id when present', async () => {
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'user-local-1', name: 'Alex' }));

    await expect(getCurrentUserId()).resolves.toBe('user-local-1');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('falls back to the auth user id and persists it for older local sessions', async () => {
    localStorage.setItem('cruush_user', JSON.stringify({ name: 'River' }));
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-auth-2',
          email: 'river@example.com',
          user_metadata: {
            display_name: 'River',
          },
        },
      },
      error: null,
    });

    await expect(getCurrentUserId()).resolves.toBe('user-auth-2');
    expect(JSON.parse(localStorage.getItem('cruush_user') ?? '{}')).toMatchObject({
      id: 'user-auth-2',
      name: 'River',
      display_name: 'River',
    });
  });
});
